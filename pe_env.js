(function(exports) {
	
	//var BASE_STACK_ADDR = 0x10100000;
	var BASE_STACK_ADDR = 0x10158000; // ~1MB stack size
	var MAX_MEM_ADDR = 0x13C00000;
	var MAGIC_RETURN_ADDR = MAX_MEM_ADDR - 1;

	/**
	 * Emulated Win32 API
	 */
	var WIN32API = (function() {
			
		var PROCESS_HEAP = 1;
		
		var heaps = {
			1 : { // Process heap
				base_ptr: 0,
				offset: 0,
				size: 0
			}
		};
		
		var API = {
			
			/**
			 * HANDLE __stdcall GetProcessHeap(void)
			 * Get handle to the process' default heap
			 */
			GetProcessHeap: function(runtime, cpu) {
				runtime.cpu.reg32[reg_eax] = PROCESS_HEAP;
				runtime.instruction_ret(0);
			},
			
			/**
			 * DWORD __stdcall HeapFree(DWORD hHeap, DWORD dwFlags, LPVOID lpMem)
			 *
			 * Free memory associated with heap
			 */
			HeapFree: (function() {
				
				var HEAP_NO_SERIALIZE = 0x1;
				
				return function(runtime, cpu) {
				
					var hHeap = runtime.get_arg(1);
					var dwFlags = runtime.get_arg(2);
					var lpMem = runtime.get_arg(3);
					
					//console.log("HeapFree: 0x" + lpMem.toString(16));
				
					if(hHeap != PROCESS_HEAP)
						throw "Invalid heap";
				
					if(dwFlags & HEAP_NO_SERIALIZE)
						throw "Fixme: HEAP_NO_SERIALIZE";
					
					var ret_val = runtime.allocator.free(lpMem) ? 1 : 0;
					
					if(!ret_val)
						throw "HeapFree: Invalid pointer";
					
					runtime.cpu.reg32[reg_eax] = ret_val;
					runtime.instruction_ret(3 * 4);
				
				};
				
			})(),
			
			/** 
			 * LPVOID __stdcall HeapAlloc(HANDLE hHeap, DWORD dwFlags, DWORD dwBytes)
			 * Allocate memory on heap
			 */
			HeapAlloc: (function() {
			
				var	HEAP_GENERATE_EXCEPTIONS = 0x4,
						HEAP_NO_SERIALIZE = 0x1,
						HEAP_ZERO_MEMORY = 0x8;
			
				return function(runtime, cpu) {
					
					var hHeap = runtime.get_arg(1);
					var dwFlags = runtime.get_arg(2);
					var dwBytes = runtime.get_arg(3);
					
					if(hHeap != PROCESS_HEAP)
						throw "Invalid heap";
					
					if(dwFlags & HEAP_GENERATE_EXCEPTIONS)
						throw "Fixme: HEAP_GENERATE_EXCEPTIONS";
					if(dwFlags & HEAP_NO_SERIALIZE)
						throw "Fixme: HEAP_NO_SERIALIZE";
					if(dwFlags & HEAP_ZERO_MEMORY)
						throw "Fixme: HEAP_ZERO_MEMORY";
										
					runtime.cpu.reg32[reg_eax] = runtime.allocator.alloc(dwBytes);
					
					//console.log("HeapAlloc: 0x" + runtime.cpu.reg32[reg_eax].toString(16) + ", " + dwBytes + " bytes");
					
					runtime.instruction_ret(3 * 4);
					
				}
			
			})()
	
		};
		
		return API;
		
	})()
	
	/**
	 * Basic runtime environment for executable
	 * @param bin Memory mapped PE image
	 * @param base_addr Base address of dumped image
	 * @param imports Address pointers for imports
	 * @param exports Exported functions
	 */
	function Win32Runtime(bin, base_addr, import_offsets, exports) {
	
		this.imports = {};
		this.exports = exports;
		this.base_addr = base_addr;
		this.stack_addr = BASE_STACK_ADDR;
		this.init_cpu();
		
		// Copy image to emulator memory
		this.cpu.memory.mem8.set(new Uint8Array(bin), 0);
		
		this.insert_hooks(import_offsets);
		
		// Private! Keep out!
		this.mem32 = this.cpu.memory.mem32s;
		
		/**
		 * Super basic memory allocator
		 */
		this.allocator = new function() {
			
			function alloc_entry(begin, end) {
				return [begin, end];
			}
			
			var MIN_BOUND = base_addr;
			var MAX_BOUND = MAX_MEM_ADDR;
			var map = [];
			
			this._map = map;
			
			// PE Image
			map.push(alloc_entry(base_addr, base_addr + bin.byteLength));
			
			console.log("Image loaded at from 0x" + map[0][0].toString(16) + " to 0x" + map[0][1].toString(16));
			
			// Stack
			map.push(alloc_entry(map[0][1], BASE_STACK_ADDR + 4 * 10));
			
			console.log("Stack range 0x" + map[1][0].toString(16) + " to 0x" + map[1][1].toString(16));
			
			/**
			 * Reallocate pointer
			 * @param ptr Heap pointer
			 * @param size Bytes to allocate
			 * @returns Heap pointer
			 */
			this.realloc = function(ptr, size) {
				
				if(ptr == 0) {
					return this.alloc(size);
				}
				
				var map_idx = -1;
				
				for(var i = 0; i < map.length; i++) {
					if(map[i][0] == ptr) {
						map_idx = i;
						break;
					}
				}
				
				if(map_idx == -1)
					throw "Tried to reallocate invalid pointer!";
				
				if(map_idx == map.length - 1) {
					
					// Expand block
					
					if(map[map_idx][0] + size > MAX_BOUND)
						throw "Out of memory!";
					
					map[map_idx][1] = map[map_idx][0] + size;
					
					return ptr;
					
				} else if(map[map_idx][0] + size < map[map_idx + 1][0]) {
				
					// Expand towards next block
					
					map[map_idx][1] = map[map_idx][0] + size;
				
				} else {
					
					// Free and make new
					
					throw "Is this dangerous?";
					
					this.free(ptr);
					return this.alloc(size);
				}
				
			};
			
			/**
			 * Allocate memory
			 * @param size Bytes to allocate
			 * @returns Number Virtual address of allocation
			 */
			this.alloc = function(size) {
				
				
				var curr, last;
				
				// align size to 4 bytes
				size = Math.ceil(size / 4) * 4;
				
				// Try to find available space inbetween current allocations
				
				for(var i = 1; i < map.length; i++) {
					
					last = map[i - 1];
					curr = map[i - 0];
					
					if(curr[0] - last[1] >= size) {
						map.splice(i, 0, alloc_entry(last[1], curr[0]));
						
						return last[1];
						
					}
					
				}
				
				// Put at end
				
				last = map[map.length - 1];
				
				if(last[1] + size > MAX_BOUND) {
					throw "Out of memory";
				}
				
				map.push(alloc_entry(last[1], last[1] + size));
				
				return last[1];
				
			};
			
			/**
			 * Deallocate memory
			 * @param addr Heap pointer
			 * @returns boolean Success
			 */
			this.free = function(addr) {
				var ret = false;
				for(var i = 0; i < map.length; i++) {
					if(map[i][0] == addr) {
						map.splice(i, 1);
						ret = true;
						break;
					}
				}
				return ret;
			};
			
		};
		
	};
	
	var fn = Win32Runtime.prototype;
	
	function call_reset() {
		this.stack_addr = BASE_STACK_ADDR;
		this.function_call_done = false;
		this.halt_instructions = false;
		window._env_stop = false;
	}
	
	/**
	 * Get integer argument to instruction
	 */
	fn.get_arg = function(n) {
		var esp_addr = this.cpu.translate_address_read(this.cpu.reg32[reg_esp]);
		return this.cpu.memory.mem32s[(esp_addr / 4) + n];
	}

	/**
	 * Simulate return instruction
	 */
	fn.instruction_ret = function(arg_size) {
		this.cpu.instruction_pointer = this.get_arg(0);
		this.cpu.reg32[reg_esp] += 4 + arg_size;
	}
	
	/**
	 * Get BYTE from pointer
	 */
	fn.get_byte_ptr = function(va) {
		var a = this.cpu.translate_address_read(va);
		return this.cpu.memory.mem8[a];
	}
	
	/**
	 * Get WORD from pointer
	 */
	fn.get_word_ptr = function(va) {
		var a = this.cpu.translate_address_read(va);
		return this.cpu.memory.mem8[a] | this.cpu.memory.mem8[a + 1] << 8;
	}
	
	/** 
	 * Set WORD from pointer
	 */
	fn.set_word_ptr = function(va, value) {
		//if(this.cpu.translate_address_read(va) % 2 != 0) throw "bricks";
		this.cpu.memory.mem16[this.cpu.translate_address_read(va) / 2] = value;
	}
	
	/**
	 * Get DWORD from pointer
	 */
	fn.get_dword_ptr = function(va) {
		var a = this.cpu.translate_address_read(va);
		//if(this.cpu.translate_address_read(va) % 4 != 0) throw "bricks";
		return (this.cpu.memory.mem8[a] | this.cpu.memory.mem8[a + 1] << 8 |
			this.cpu.memory.mem8[a + 2] << 16 | this.cpu.memory.mem8[a + 3] << 24) >>> 0;
		//return this.cpu.memory.mem32s[this.cpu.translate_address_read(va) / 4];
	}
	
	fn.set_dword_ptr = function(va, value) {
		if(this.cpu.translate_address_read(va) % 4 != 0) throw "bricks";
		this.cpu.memory.mem32s[this.cpu.translate_address_read(va) / 4] = value;
	}
	
	/**
	 * Copy data to virtual memory address
	 */
	fn.copy_to_mem = function(dst_address, array) {
		var phys_addr = this.cpu.translate_address_write(dst_address);
		this.cpu.memory.mem8.set(array, phys_addr);
	};
	
	fn.copy_from_mem = function(src_address, array) {
		var phys_addr = this.cpu.translate_address_read(src_address);
		array.set(this.cpu.memory.mem8.subarray(phys_addr, phys_addr + array.length));
	};
	
	fn.jump = function(address) {
		
	};
	
	window.cycle_counter = {};
	
	/**
	 * Call a function using the STDCALL calling convention
	 */
	fn.stdcall = function(address) {
		
		call_reset.call(this);
		
		var cpu = this.cpu;
		
		var sp_addr = cpu.translate_address_read(cpu.reg32[reg_esp]) / 4;
		
		// Setup return address
		
		cpu.memory.mem32s[sp_addr++] = MAGIC_RETURN_ADDR;
		
		// Push arguments (integers)
		
		for(var i = 1; i < arguments.length; i++) {
			cpu.memory.mem32s[sp_addr++] = arguments[i];
		}
		
		// Jump to function
		
		cpu.instruction_pointer = address;
		
		// Execute
		
		var i = 0;
		
		while(!window._env_stop && !this.function_call_done && !this.halt_instructions) {
			cpu.cycle();
			//if(!(cpu.instruction_pointer in window.cycle_counter))
			//window.cycle_counter[cpu.instruction_pointer] = 1;
			//else window.cycle_counter[cpu.instruction_pointer]++;
		}
		
		if(this.function_call_done) {
			return cpu.reg32[reg_eax];
		} else {
			throw "Failed";
		}
		
	}
	
	/**
	 * Initialize CPU
	 */
	fn.init_cpu = function() {
	
		//DEBUG = false;
	
		var cpu = this.cpu = new v86();
		
		var base_addr = this.base_addr;
		
		/* Simplify the problem of address translation */
		cpu.translate_address_write = 
		cpu.translate_address_user_write = 
		cpu.translate_address_user_read = 
		cpu.translate_address_system_write = 
		cpu.translate_address_system_read = 
		cpu.translate_address_read = function(addr)
		{
				return addr - base_addr;
		};
				
		cpu.init({});
		
		cpu.memory.memfloat = new Float32Array(cpu.memory.mem32s.buffer);
		
		cpu.memory.readFloat = function(phys_addr) {
			if(phys_addr % 4 == 0)
				return this.memfloat[phys_addr >> 2];
			else throw "inception";
		};
		
		cpu.fpu = new FPU(cpu);
	
		cpu.switch_seg(reg_cs, 0);
		cpu.switch_seg(reg_ss, 0);
		cpu.switch_seg(reg_ds, 0);
		cpu.switch_seg(reg_es, 0);
		cpu.switch_seg(reg_gs, 0);
		cpu.switch_seg(reg_fs, 0);
		cpu.is_32 = true;
		cpu.address_size_32 = true;
		cpu.operand_size_32 = true;
		cpu.stack_size_32 = true;
		cpu.protected_mode = true;
		cpu.update_operand_size();
		cpu.update_address_size();
		cpu.regv = cpu.reg32s;
		cpu.reg_vsp = reg_esp;
		cpu.reg_vbp = reg_ebp;
		
		cpu.paging = true;
		
		cpu.stack_reg = cpu.reg32s;
		cpu.reg32[reg_esp] = this.stack_addr;
	
	};
	
	/**
	 * Add hook for function calls
	 * @param va Virtual address
	 * @param fn Hook function
	 */
	fn.add_hook = function(va, fn) {
		WIN32API[va] = fn;
		this.imports[va] = va;
	};
	
	/**
	 * Hook call and return instructions, setup real addresses for imports
	 */
	fn.insert_hooks = function(import_offsets) {
		
		// Setup real virtual addresses for imports
		
		for(addr in import_offsets) {
			
			var real_addr = this.cpu.translate_address_read(addr);
			
			if(real_addr % 4 != 0)
				throw "Fixme: Alignment error";
			
			var virtual_addr = this.cpu.memory.mem32s[real_addr / 4];
			
			//console.log(this.imports[addr] + " is at 0x" + virtual_addr.toString(16));
			
			this.imports[virtual_addr] = import_offsets[addr];
			
		}
				
		var self = this;
		
		window.functions_called = {};
		window.functions_time = {};
		window.functions_num_calls = 0;
		window.functions_num_rets = 0;
		
		window.function_call_stack = [];
		
		function call_check(cpu) {
			
			//console.log("Calling function at 0x" + cpu.instruction_pointer.toString(16));
			
			if(self.imports[cpu.instruction_pointer] !== undefined) {
				
				var method_name = self.imports[cpu.instruction_pointer];
				
				if(method_name in WIN32API) {
					WIN32API[method_name](self, cpu);
					return;
				}
				else {
					self.halt_instructions = true;
					throw "Called unimplemented imported function " + method_name;
				}
			}
			
			window.functions_num_calls++;
			window.function_call_stack.push([cpu.instruction_pointer, performance.now()]);
			
			//if(cpu.instruction_pointer in functions_called)
			//	functions_called[cpu.instruction_pointer]++;
			//else 
			//	functions_called[cpu.instruction_pointer] = 1;
			
		}
		
		function ret_check(cpu) {
		
			window.functions_num_rets++;
			
			if(window.function_call_stack.length > 0) {
				var l = window.function_call_stack.pop();
				var fn = l[0];
				var dt = performance.now() - l[1];
				
				if(!(fn in window.functions_time))
					window.functions_time[fn] = dt;
				else window.functions_time[fn] += dt;
			}
		
			if(cpu.instruction_pointer == MAGIC_RETURN_ADDR) {
				self.halt_instructions = true;
				self.function_call_done = true;
			}
		}
		
		// Hook our jump checks into some instructions
		
		table32[0xE8] = function(cpu) { 
			{ /* call*/ 
				var imm32s = cpu.read_imm32s(); 
				cpu.push32(cpu.get_real_eip()); 
				cpu.instruction_pointer = cpu.instruction_pointer + imm32s | 0; 
				cpu.last_instr_jump = true; 
				
				call_check(cpu);
			}
		};
		
		table32[0xFF] = function(cpu) {

			var modrm_byte = cpu.read_imm8();

			{
					switch (modrm_byte >> 3 & 7) {
							case 0:
									{
											var data;
											var virt_addr;
											var phys_addr;
											var phys_addr_high = 0;
											var result;
											if (modrm_byte < 0xC0) {
													virt_addr = cpu.modrm_resolve(modrm_byte);
													phys_addr = cpu.translate_address_write(virt_addr);
													if (cpu.paging && (virt_addr & 0xFFF) >= 0xFFD) {
															phys_addr_high = cpu.translate_address_write(virt_addr + 3);
															data = cpu.virt_boundary_read32s(phys_addr, phys_addr_high);
													} else {
															data = cpu.memory.read32s(phys_addr);
													}
											} else {
													data = cpu.reg32s[modrm_byte & 7];
											}
											result = cpu.inc(data, OPSIZE_32);
											if (modrm_byte < 0xC0) {
													if (phys_addr_high) {
															cpu.virt_boundary_write32(phys_addr, phys_addr_high, result);
													} else {
															cpu.memory.write32(phys_addr, result);
													}
											} else {
													cpu.reg32s[modrm_byte & 7] = result;
											};
									};
									break;
							case 1:
									{
											var data;
											var virt_addr;
											var phys_addr;
											var phys_addr_high = 0;
											var result;
											if (modrm_byte < 0xC0) {
													virt_addr = cpu.modrm_resolve(modrm_byte);
													phys_addr = cpu.translate_address_write(virt_addr);
													if (cpu.paging && (virt_addr & 0xFFF) >= 0xFFD) {
															phys_addr_high = cpu.translate_address_write(virt_addr + 3);
															data = cpu.virt_boundary_read32s(phys_addr, phys_addr_high);
													} else {
															data = cpu.memory.read32s(phys_addr);
													}
											} else {
													data = cpu.reg32s[modrm_byte & 7];
											}
											result = cpu.dec(data, OPSIZE_32);
											if (modrm_byte < 0xC0) {
													if (phys_addr_high) {
															cpu.virt_boundary_write32(phys_addr, phys_addr_high, result);
													} else {
															cpu.memory.write32(phys_addr, result);
													}
											} else {
													cpu.reg32s[modrm_byte & 7] = result;
											};
									};
									break;
							case 2:
									{ /* 2, call near*/
											if (modrm_byte < 0xC0) {
													var data = cpu.safe_read32s(cpu.modrm_resolve(modrm_byte));
											} else {
													data = cpu.reg32s[modrm_byte & 7];
											};
											cpu.push32(cpu.get_real_eip());
											cpu.instruction_pointer = cpu.get_seg(reg_cs) + data | 0;
											
											//console.log("Callnear 0x" + data.toString(16) );
											call_check(cpu);
											
											cpu.last_instr_jump = true;
									};
									break;
							case 3:
									{ /* 3, callf*/
											if (modrm_byte >= 0xC0) {
													cpu.trigger_ud();
													dbg_assert(false);
											}
											var virt_addr = cpu.modrm_resolve(modrm_byte);
											var new_cs = cpu.safe_read16(virt_addr + 4);
											var new_ip = cpu.safe_read32s(virt_addr);
											cpu.writable_or_pagefault(cpu.get_stack_pointer(-8), 8);
											cpu.push32(cpu.sreg[reg_cs]);
											cpu.push32(cpu.get_real_eip());
											cpu.switch_seg(reg_cs, new_cs);
											cpu.instruction_pointer = cpu.get_seg(reg_cs) + new_ip | 0;
											
											console.log("Callfar");
											call_check(cpu);
											
											cpu.last_instr_jump = true;
									};
									break;
							case 4:
									{ /* 4, jmp near*/
											if (modrm_byte < 0xC0) {
													var data = cpu.safe_read32s(cpu.modrm_resolve(modrm_byte));
											} else {
													data = cpu.reg32s[modrm_byte & 7];
											};
											cpu.instruction_pointer = cpu.get_seg(reg_cs) + data | 0;
											cpu.last_instr_jump = true;
									};
									break;
							case 5:
									{ /* 5, jmpf*/
											if (modrm_byte >= 0xC0) {
													cpu.trigger_ud();
													dbg_assert(false);
											}
											var virt_addr = cpu.modrm_resolve(modrm_byte);
											var new_cs = cpu.safe_read16(virt_addr + 4);
											var new_ip = cpu.safe_read32s(virt_addr);
											cpu.switch_seg(reg_cs, new_cs);
											cpu.instruction_pointer = cpu.get_seg(reg_cs) + new_ip | 0;
											cpu.last_instr_jump = true;
									};
									break;
							case 6:
									{ /* push*/
											if (modrm_byte < 0xC0) {
													var data = cpu.safe_read32s(cpu.modrm_resolve(modrm_byte));
											} else {
													data = cpu.reg32s[modrm_byte & 7];
											};
											cpu.push32(data);
									};
									break;
							case 7:
									{
											if (DEBUG) {
													dbg_trace();
													throw "TODO";
											}
											cpu.trigger_ud();;
									};
									break;
					}
			}
		};

		/* retn */

		var _0xC2 = table32[0xC2];
		var _0xC3 = table32[0xC3];
		
		table32[0xC3] = function(cpu) {
			_0xC3(cpu);
			ret_check(cpu);
		}

		table32[0xC2] = function(cpu) { 
			_0xC2(cpu);
			ret_check(cpu);
		};
	
	};
	
	exports.Win32Runtime = Win32Runtime;
	
})(this);


var ZERO_BUFFER = new Uint8Array(new ArrayBuffer(1024 * 4)); // 4 KiB

function stosd(cpu)
{
    var data = cpu.reg32s[reg_eax];
    var src, dest, data_src, data_dest = 0, phys_dest, phys_src; 
    var size = cpu.flags & flag_direction ? -4 : 4;
    var cont = false; 
    
    dest = cpu.get_seg(reg_es) + cpu.regv[cpu.reg_vdi] | 0; 
    
    if(cpu.repeat_string_prefix !== REPEAT_STRING_PREFIX_NONE) { 
			
			var count = cpu.regv[cpu.reg_vcx] >>> 0, start_count = count; 
			
			if (count === 0) return; 
			
			var next_cycle = 0x4000; 
			var aligned = !(dest & (32 >> 3) - 1); 
			
			if(aligned) {
				
				var single_size = size >> 31 | 1; 
				
				if(cpu.paging) { 
					next_cycle = Math.min(next_cycle, (single_size >> 1 ^ ~dest) & 0xFFF); 
					phys_dest = cpu.translate_address_write(dest); 
					next_cycle >>= 2;
				} 
				else {
					phys_dest = dest; 
				} 
				
				phys_dest >>>= 2; 
				
				if(data === 0) {
				
					if(next_cycle + 1 < count)
						cont = true;
					
					var copy_len = cont ? next_cycle + 1 : count;
					var phys_dest_end = phys_dest + copy_len * size;
					
					cpu.memory.mem32s.set(ZERO_BUFFER.subarray(0, copy_len), 
						phys_dest > phys_dest_end ? phys_dest_end : phys_dest);
					
					
					count -= copy_len;
					next_cycle -= copy_len; // wrong?
					
				} 
				else 
				{				
					do 
					{
						cpu.memory.write_aligned32(phys_dest, data); 
						phys_dest += single_size; 
						cont = --count !== 0; 
					} while(cont && next_cycle--);
				}
				
				var diff = size * (start_count - count) | 0; 
				cpu.regv[cpu.reg_vdi] += diff; 
				cpu.regv[cpu.reg_vcx] = count; 
				cpu.timestamp_counter += start_count - count; 
			
		}
		else 
		{ 
		
				do { 
					cpu.safe_write32(dest, data);
					dest += size, cpu.regv[cpu.reg_vdi] += size; 
					cont = --cpu.regv[cpu.reg_vcx] !== 0; 
				
				} while(cont && next_cycle--); 
		
		}
	} 
	else { 
		cpu.safe_write32(dest, data);
		cpu.regv[cpu.reg_vdi] += size; 
	}
	if(cont) { 
		cpu.instruction_pointer = cpu.previous_ip; 
	};
}