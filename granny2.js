(function(exports) {

	/**
	 * Wrapper for granny2.dll
	 */
	function Granny2(bin_img) {

		this.runtime = new Win32Runtime(bin_img, 0x10000000, Granny2.import_offsets, Granny2.exports);

		this.runtime.add_hook(0x1000DDC0, sub_1000DDC0);
		this.runtime.add_hook(0x1000DDB0, sub_1000DDC0);
		
		this.runtime.add_hook(0x10017FE0, sub_10017FE0); // Logging
		
		this.runtime.add_hook(0x10002B50, sub_10002B50); // ??
		
		this.runtime.add_hook(0x1000E7F0, sub_1000E7F0);
		
		// 0x10006E50 perhaps ?
		
	};

	Granny2.structs = {
	
		'granny_skeleton': [
			['char*', 'Name', { string: true }],
			['int', 'BoneCount', {}],
			['void*', 'Bones', {}]
		],
		
		'granny_variant': [
			['int', 'Type', {}],
			['int', 'Object', {}],
		],
		
		'granny_model_mesh_binding': [
			//['void*', 'Mesh', {}]
			['void*', 'Mesh', {}]
		],
		
		'granny_mesh': [
			['char*', 'Name', { string: true }],
			['void*', 'PrimaryVertexData', {}],
			['int', 'MorphTargetCount', {}],
			['void*', 'MorphTargets', {}],
			['void*', 'PrimaryTopology', {}],
			['int', 'MaterialsBindingCount', {}],
			['void*', 'MaterialBindings', {}],
			['int', 'BoneBindingsCount', {}],
			['void*', 'BoneBindings', {}],
			['int', 'ExtendedData_Variant_Type', {}],
			['int', 'ExtendedData_Variant_Object', {}],
		],
	
		'granny_transform': [
			['int', 'Flags', {}],
			['float[3]', 'Position', {}],
			['float[4]', 'Orientation', {}],
			['float[9]', 'ScaleShear', {}],
		],
	
		'granny_model': [
			['char*', 'Name', { string: true }],
			['void*', 'Skeleton', {}],
			['granny_transform', 'InitialPlacement', {}],
			['int', 'MeshBindingsCount', {}],
			//['granny_model_mesh_binding*', 'MeshBindings', { size: 'MeshBindingsCount' }],
			//['granny_model_mesh_binding*', 'MeshBindings', { size: 'MeshBindingsCount' }],
			['granny_model_mesh_binding*', 'MeshBindings', { size: 'MeshBindingsCount' }],
		],
	
		'granny_file_info': [
			['char**', 'FileStringTable', {}],
			['void*', 'ArtToolInfo', {}],
			['void*', 'ExporterInfo', {}],
			['char*', 'FromFileName', { string: true }],
			['int', 'TextureCount', {}],
			['void*', 'Textures', {}],
			['int', 'MaterialCount', {}],
			['void*', 'Materials', {}],
			['int', 'SkeletonCount', {}],
			['granny_skeleton*', 'Skeletons', { size: 'SkeletonCount' }],
			['int', 'VertexDataCount', {}],
			['void*', 'VertexDatas', {}],
			['int', 'TriTopologyCount', {}],
			['void*', 'TriTopologies', {}],
			['int', 'MeshCount', {}],
			['granny_mesh*', 'Meshes', { size: 'MeshCount' }],
			['int', 'ModelCount', {}],
			['granny_model*', 'Models', { size: 'ModelCount' }],
			['int', 'TrackGroupCount', {}],
			['void*', 'TrackGroups', {}],
			['int', 'AnimationCount', {}],
			['void*', 'Animations', {}],
		],
	
		'granny_file': [
			['char', 'IsByteReversed', {}],
			['char[3]', '_align', {}],
			
			//['granny_grn_file_header*', 'Header'],
			['void*', 'Header', {}],
			
			['int', 'SectionCount', {}],
			['void**', 'Sections', {}],
			['char*', 'Marshalled', { string: false }],
			['void*', 'ConversionBuffer', {}],
		],
		
		'granny_texture': [
			['char*', 'FromFileName', { string: true }],
			['int', 'TextureType', {}],
			['int', 'Width', {}],
			['int', 'Height', {}],
			['int', 'Encoding', {}],
			['int', 'SubFormat', {}],
			['int', 'BytesPerPixel', {}],
			['int[4]', 'ShiftForComponent', {}],
			['int[4]', 'BitsForComponent', {}],
			['int', 'ImageCount', {}],
			//['granny_texture_image*', 'Images', {}],
			['void*', 'Images', {}],
			//['granny_variant', 'ExtendedData', {}],
			['int', 'ExtendedData', {}],
		],
		
	};

	/**
	 * @param ptr Virtual address of structure
	 * @param decl Structure declaration
	 * @param cpu	v86
	 */
	function resolve_struct(cpu, ptr, decl) {
		
		var struct = {};
		
		struct._ptr = ptr;
		struct._type = decl;
		
		//var va = cpu.translate_address_read(ptr);
		var va = ptr;
		
		for(var i = 0; i < decl.length; i++) {
			
			var type = decl[i][0];
			var name = decl[i][1];
			var flags = decl[i][2];
			var is_ptr = /\*$/.test(type);
			var is_arr = /\[(\d*)\]$/.test(type);
			
			var arr_len = 0;
			
			if(is_arr) {
				arr_len = Number(type.match(/\[(\d*)\]$/)[1]);
			} else {
				arr_len = 1;
			}
			
			//var base_type = type.match(/^\w*/)[0];
			
			var base_type = type.replace(/[\*]$/,'');
			
			if(is_arr) {
				base_type = type.replace(/\[(\d*)\]$/, '');
			}
			
			var data_size = 4;
			var method = 'read32s';
			
			switch(base_type) {
				case 'char':
					data_size = 1;
					method = 'read8';
				case 'int':
				case 'void':
				case 'void*':
				case 'float':
				
					//console.log("Reading " + name);
					
					if(base_type == 'float')
						method = 'readFloat';
					
					if(is_arr) 
					{
						// PRIMITIVE[N]
						var arr = [];
						for(var j = 0; j < arr_len; j++, va += data_size) arr.push(cpu.memory[method](cpu.translate_address_read(va)));
						struct[name] = arr;
					} 
					else if(is_ptr)
					{
						if(base_type == 'char' && flags.string) {
							struct[name] = cpu.memory.read_string(cpu.translate_address_read(cpu.memory.read32s(cpu.translate_address_read(va))));
							va += 4;
							//va += struct[name].length + 1;
						} else {
							//console.log("Type: " + type + ", base type: " + base_type + ", data size: " + data_size + ", array size: " + arr_len);
							// Just keep a copy of the pointer
							struct[name] = cpu.memory.read32s(cpu.translate_address_read(va));
							va += 4;
						}
					} 
					else 
					{
						struct[name] = cpu.memory[method](cpu.translate_address_read(va));
						va += data_size;
					}
					
					break;
					
				default:
				
					if(base_type in Granny2.structs) {
						
						var size = 1;
						
						if(typeof flags.size == 'number') {
							size = flags.size;
						} else if(typeof flags.size == 'string') {
							if(!(flags.size in struct))
								throw "Invalid size";
							size = Number(struct[flags.size]);
						}
						
						struct[name] = [];
						
						var arr_base_addr;
						
						if(is_ptr) {

							arr_base_addr = cpu.memory.read32s(cpu.translate_address_read(va));
							
							for(var j = 0; j < size; j++) {
								struct[name].push(
									resolve_struct(
										cpu, 
										cpu.memory.read32s(cpu.translate_address_read(arr_base_addr) + 4 * j),
										Granny2.structs[base_type]
									)
								);
							}
							
							va += 4;
							
						} else {
							
							arr_base_addr = va;
							
							for(var j = 0; j < size; j++) {
								struct[name].push(resolve_struct(cpu, va, Granny2.structs[base_type]));
								va += struct[name][j]._size;
							}
							
						}
							
						
					} else {
						
						if(is_ptr) {
							struct[name] = cpu.memory.read32s(cpu.translate_address_read(va));
							va += 4;
						} else {
							throw "Unknown data type \"" + type + "\" in structure declaration";
						}
						
					}
				
			}
			
		}
		
		struct._size = va - struct._ptr;
		
		return struct;
			
	};

	Granny2.readStructure = resolve_struct;

	var api = Granny2.prototype;
	
	api.CopyMeshVertices = function(granny_mesh_ptr) {
		
		var size = this.GetMeshVertexCount(granny_mesh_ptr) * 32;
		var buffer_ptr = this.runtime.allocator.alloc(size);
	
		var success = this.runtime.stdcall(
			Granny2.exports.GrannyCopyMeshVertices,
			granny_mesh_ptr,
			this.runtime.get_dword_ptr(Granny2.exports.GrannyPNT332VertexType),
			buffer_ptr
		);
		
		//if(!success) throw "Failed to copy mesh vertoces";
		
		var vertices = new Uint8Array(new ArrayBuffer(size));
		
		this.runtime.copy_from_mem(buffer_ptr, vertices);
		this.runtime.allocator.free(buffer_ptr);
		
		return vertices;
		
	};
	
	api.NewMeshDeformer = function(vertex_type) {
		
		var mesh_deformer = this.runtime.stdcall(
			Granny2.exports.GrannyNewMeshDeformer,
			vertex_type,
			this.runtime.get_dword_ptr(Granny2.exports.GrannyPNT332VertexType),
			2
		);
		
		return mesh_deformer;
		
	};
	
	api.GetMeshVertexType = function(granny_mesh_ptr) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshVertexType,
			granny_mesh_ptr
		);
	};
	
	api.MeshIsRigid = function(granny_mesh_ptr) {
		return !!this.runtime.stdcall(
			Granny2.exports.GrannyMeshIsRigid,
			granny_mesh_ptr
		);
	}
	
	api.GetMeshVertexCount = function(granny_mesh_ptr) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshVertexCount,
			granny_mesh_ptr
		);
	};
	
	api.CopyMeshIndices = function(granny_mesh_ptr) {
	
		var size = this.GetMeshIndexCount(granny_mesh_ptr);
	
		var buffer_ptr = this.runtime.allocator.alloc(size * 2);
	
		var success = this.runtime.stdcall(
			Granny2.exports.GrannyCopyMeshIndices,
			granny_mesh_ptr,
			2,
			buffer_ptr
		);
		
		if(!success) throw "Failed to copy mesh indices";
		
		var indices = new Uint8Array(new ArrayBuffer(size * 2));
		
		this.runtime.copy_from_mem(buffer_ptr, indices);
		this.runtime.allocator.free(buffer_ptr);
		
		return indices;
	
	};
	
	api.GetMeshIndexCount = function(granny_mesh_ptr) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshIndexCount,
			granny_mesh_ptr
		);
	};
	
	api.NewMeshBinding = function(granny_mesh_ptr, source_skeleton1, source_skeleton2) {
		
		granny_mesh_binding = this.runtime.stdcall(
			Granny2.exports.GrannyNewMeshBinding,
			granny_mesh_ptr, 
			source_skeleton1, 
			source_skeleton2
		);
		
		return granny_mesh_binding;
	};
	
	api.GetSourceSkeleton = function(granny_model_instance_ptr) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetSourceSkeleton,
			granny_model_instance_ptr
		);
	};
	
	api.NewWorldPose = function(bones_count) {
		
		var granny_world_pose = this.runtime.stdcall(
			Granny2.exports.GrannyNewWorldPose,
			bones_count
		);
		
		return granny_world_pose;
		
	};
	
	api.InstantiateModel = function(granny_model_ptr) {
		
		var granny_model_instance = this.runtime.stdcall(
			Granny2.exports.GrannyInstantiateModel,
			granny_model_ptr
		);
		
		return granny_model_instance;
		
	};
	
	/**
	 * Check against DLL version
	 * @param number v1 Major version
	 * @param number v2 Minor version
	 * @param number v3 Product version
	 * @param number v4 Build version
	 * @returns boolean
	 */
	api.VersionMatch = function(v1, v2, v3, v4) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyVersionsMatch_,
			v1, v2, v3, v4) != 0;
	};
	
	/**
	 * Load GR2 file from memory
	 * @param ArrayBuffer gr2_file Buffer containing a GR2 file
	 * @returns number granny_file_ptr Virtual address for granny_file structure
	 */
	api.ReadEntireFileFromMemory = function(gr2_file) {
		
		var size = gr2_file.byteLength;
		var ptr = this.runtime.allocator.alloc(size);
		
		this.runtime.copy_to_mem(ptr, new Uint8Array(gr2_file));
		
		var result = this.runtime.stdcall(
			Granny2.exports.GrannyReadEntireFileFromMemory,
			size,
			ptr
		);
		
		return result;
		//console.log("ReadEntireFileFromMemory", result);
		
		// Free ptr?
		
	};
	
	/**
	 * Get file information
	 * @param number Virtual address of granny_file structure
	 * @returns number Virtual address of granny_file_info structure
	 */
	api.GetFileInfo = function(granny_file_ptr) {
		
		var result = this.runtime.stdcall(
			Granny2.exports.GrannyGetFileInfo,
			granny_file_ptr
		);
				
		return result;
		
	};
	
	/**
	 * Checks if the texture has an alpha channel
	 * @param granny_texture_ptr Virtual address of granny_texture structure
	 * @returns boolean
	 */
	api.TextureHasAlpha = function(granny_texture_ptr) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyTextureHasAlpha,
			granny_texture_ptr
		) != 0;
	};
	
	Granny2.GrannyRGBA8888PixelFormat = 4;
	
	api.CopyTextureImage = function(granny_texture_ptr) {
		
		var width = this.runtime.get_dword_ptr(granny_texture_ptr + 2 * 4);
		var height = this.runtime.get_dword_ptr(granny_texture_ptr + 3 * 4);
		
		console.log(width, height);
		
		var buffer_size = 4 * width * height;
		var buffer_ptr = this.runtime.allocator.alloc(buffer_size);
				
		var result = this.runtime.stdcall(
			Granny2.exports.GrannyCopyTextureImage,
			granny_texture_ptr,
			0, 
			0,
			this.runtime.get_dword_ptr(Granny2.exports.GrannyRGBA8888PixelFormat),
			width, 
			height,
			4 * width,
			buffer_ptr
		);
		
		console.log("CopyTextureImage:", result);
		
		// TODO how to deallocate? return copy of data?
		
		return this.runtime.cpu.memory.mem8.subarray(
			this.runtime.cpu.translate_address_read(buffer_ptr),
			this.runtime.cpu.translate_address_read(buffer_ptr + buffer_size)
		);
		
	};
	
	function sub_10002BB0(a1, a2) {
		return (a2 <= 0)
			? a1 >>> -a2
			: a1 << a2;
	}
	
	function sub_10002B50(rt, cpu) {
		
		a3 = rt.get_arg(3) >>> 0;
		a2 = rt.get_arg(2) >>> 0;
		a1 = rt.get_arg(1) >>> 0;
		
		var va_a1 = rt.cpu.translate_address_write(a1) / 4;
		var va_a2 = rt.cpu.translate_address_write(a2) / 4;
		var data_a1 = rt.cpu.memory.mem32s.subarray(va_a1, va_a1 + 4);
		var data_a2 = rt.cpu.memory.mem32s.subarray(va_a2, va_a2 + 4);
		var v4 = data_a2[3] & sub_10002BB0(a3, data_a1[3]);
		var v5 = (data_a2[2] & sub_10002BB0(a3, data_a1[2])) + v4;
		var v6 = (data_a2[1] & sub_10002BB0(a3, data_a1[1])) + v5;
		
		rt.cpu.reg32s[reg_eax] = v6 + (data_a2[0] & sub_10002BB0(a3, data_a1[0]));
		rt.instruction_ret(0);
		
	}
	
	// For convenience, a hook for Granny's logging function 
	
	function sub_10017FE0(runtime, cpu) {
		
		var a3 = runtime.get_arg(7);
		var a2 = runtime.get_arg(6);
		var a1 = runtime.get_arg(5);
		var source = runtime.get_arg(4);
		var error = runtime.get_arg(3);
		
		// Don't know what these are for
		//var param2 = runtime.get_arg(2);
		//var param1 = runtime.get_arg(1);
		
		function get_string(addr) {
			var str = '';
			var c;
			var va = runtime.cpu.translate_address_read(addr);
			
			while((c = runtime.cpu.memory.mem8[va]) != 0x00) {
				str += String.fromCharCode(c);
				va++;
			}
			return str;
		}
		
		
		var error_fmt = get_string(error);
		var error_src = get_string(source);
		
		var error_str = error_fmt;
		
		error_str = error_str.replace(/%s/, error_src);
		error_str = error_str.replace(/%d/, a1);
		error_str = error_str.replace(/%d/, a2);
		error_str = error_str.replace(/%d/, a3);
		
		console.warn("[granny2.dll] " + error_str);
		
		runtime.cpu.reg32[reg_eax] = 1;
		runtime.instruction_ret(0);
		
	}
	
	// Stack variables
	var v = new Uint32Array(new ArrayBuffer(33 * 4));
	var v32 = v;
	var v16 = new Uint32Array(new ArrayBuffer(33 * 4));
	var v8 = new Uint32Array(new ArrayBuffer(33 * 4));
	
	// Candidates: 
	// sub_1000E020
	
	// Some decompression functions implemented in JS for performance
	
	function sub_1000E7F0(rt, cpu) {
	
		var a3 = rt.get_arg(3);
		var a2 = rt.get_arg(2) & 0xFFFF; // WORD
		var a1 = rt.get_arg(1);
		
		var data32 = rt.cpu.memory.mem32s.subarray(rt.cpu.translate_address_write(a1) / 4);
		var data16 = rt.cpu.memory.mem16.subarray(rt.cpu.translate_address_write(a1) / 2);
		var data8  = rt.cpu.memory.mem8.subarray(rt.cpu.translate_address_write(a1));
		
		v[5] = data16[7];
		v[3] &= 0x0000ffff;
		
		if ( a2 >= v[5] )
		{
			v[3] = data16[11];
			v[32] = v[3];
			
			if ( a2 >= (v[3] & 0xffff) )
			{
				v[23] = data16[13];
				
				if ( a2 >= v[23] )
				{
					if ( a2 >= data16[14] )
					{
						v[8] = data16[18];
						v[9] = data16[14];
						data16[15]++;
					}
					else
					{
						v[8] = 14 << data8[38];
						v[9] = data16[13];
						data32[7] += 0x10001;
					}
				}
				else
				{
					v[24] = data8[38];
					if ( a2 >= data16[12] )
					{
						v[8] = 13 << (v[24] & 0xFF);
						v[25] = data32[7];
						v[9] = data16[12];
						data16[13] = v[23] + 1;
						data32[7] = v[25] + 0x10001;
					}
					else
					{
						v[9] = (v[3] & 0xffff) >>> 0;
						v[8] = 12 << (v[24] & 0xFF);
						data32[6] += 0x10001;
						data32[7] += 0x10001;
					}
				}
			}
			else
			{
				v[19] = data16[9];
				v[18] = data8[38] & 0xFF;
				if ( a2 >= v[19] )
				{
					if ( a2 >= data16[10] )
					{
						v[8] = 11 << (v[18] & 0xFF);
						v[9] = data16[10];
						data16[11] = v[32] + 1;
					}
					else
					{
						v[22] = data16[9];
						v[8] = 10 << (v[18] & 0xFF);
						v[9] = v[22];
						data32[5] += 0x10001;
					}
					data32[6] += 0x10001;
					data32[7] += 0x10001;
				}
				else
				{
					v[20] = data16[8];
					if ( a2 >= v[20] )
					{
						v[8] = 9 << (v[18] & 0xFF);
						v[9] = v[20];
						data16[9] = v[19] + 1;
					}
					else
					{
						v[8] = 8 << (v[18] & 0xFF);
						v[9] = v[5];
						data32[4] += 0x10001;
					}
					data32[5] += 0x10001;
					data32[6] += 0x10001;
					data32[7] += 0x10001;
				}
			}
		}
		else
		{
			v[3] = (v[3] & 0xFFFF0000) + (data16[3] & 0x0000FFFF);
			v[31] = v[3];
			if ( a2 >= v[3] & 0xFFFF )
			{
				v[11] = data16[5];
				v[10] = data8[38] & 0xFF;
				if ( a2 >= v[11] )
				{
					v[14] = data16[6];
					if ( a2 >= v[14] )
					{
						v[8] = 7 << (v[10] & 0xFF);
						v[9] = v[14];
						data16[7] = v[5] + 1;
					}
					else
					{
						v[15] = data16[5];
						v[8] = 6 << (v[10] & 0xFF);
						v[9] = v[15];
						data32[3] += 0x10001;
					}
				}
				else
				{
					v[12] = data16[4];
					if ( a2 >= v[12] & 0xFFFF )
					{
						v[8] = 5 << (v[10] & 0xFF);
						v[9] = v[12];
						data16[5] = v[11] + 1;
					}
					else
					{
						v[9] = (v[3] & 0xFFFF) >>> 0;
						v[8] = 4 << (v[10] & 0xFF);
						data32[2] += 0x10001;
					}
					data32[3] += 0x10001;
				}
				data32[4] += 0x10001;
				data32[5] += 0x10001;
				data32[6] += 0x10001;
				data32[7] += 0x10001;
			}
			else
			{
				v[7] = data16[1];
				if ( a2 >= v[7] )
				{
					if ( a2 >= data16[2] )
					{
						v[8] = 3 << data8[38];
						v[9] = data16[2];
						data16[3] = v[31] + 1;
					}
					else
					{
						v[9] = data16[1];
						v[8] = 2 << data8[38];
						data32[1] += 0x10001;
						
					}
				}
				else
				{
					if ( a2 >= data16[0] )
					{
						v[8] = data16[20] & 0xFFFF;
						v[9] = data16[0];
						data16[1] = v[7] + 1;
					}
					else
					{
						v[8] = 0;
						v[9] = 0;
						data32[0] += 0x10001;
					}
					data32[1] += 0x10001;
				}
				data32[2] += 0x10001;
				data32[3] += 0x10001;
				data32[4] += 0x10001;
				data32[5] += 0x10001;
				data32[6] += 0x10001;
				data32[7] += 0x10001;
			}
		}
		
		for ( var i = 2 * v[8] + 56; true; i = v[28] + 2 )
		{
			v[27] = v[9] + data16[i / 2];
			
			if ( a2 < v[27] ) {
				rt.set_dword_ptr(a3, v[9]);
				rt.cpu.reg32[reg_eax] = v[8];
				rt.instruction_ret(0);
				return;
			}
			
			v[29] = data16[(i + 2) / 2];
			v[28] = i + 2;
			++v[8];
			v[9] = v[27] + v[29];
			if ( a2 < v[9] ) break;
			++v[8];
		}
		
		rt.set_dword_ptr(a3, v[27]);
		rt.cpu.reg32[reg_eax] = v[8];
		rt.instruction_ret(0);
	}
	
	/**
	 * int __cdecl sub_1000DDC0(void *a1, unsigned int a2, int a3, unsigned int a4)
	 * Seems like some sort of method for decompression, or possibly decryption
	 */
	function sub_1000DDC0(rt, cpu) {
		
		var byte_1002A4B4 = [
			0x0, 0x8, 0x4, 0xC, 
			0x2, 0xA, 0x6, 0xE, 
			0x1, 0x9, 0x5, 0xD, 
			0x3, 0xB, 0x7, 0xF
		];
		
		var a1, a2, a3, a4;
		var result;
		
		a4 = rt.get_arg(4) >>> 0;
		a3 = rt.get_arg(3) >>> 0;
		a2 = rt.get_arg(2) >>> 0;
		a1 = rt.get_arg(1) >>> 0;
		
		var va = rt.cpu.translate_address_write(a1);
		var data = rt.mem32.subarray(va / 4, va / 4 + 7);
		
		v[6] = data[6];
		v[8] = data[5];
		v[9] = data[4] - v[8] + 1;
		
		v[31] = data[6];
		
		v[5] = (((a3 + a2) * v[9] / a4) >>> 0) + v[8] - 1;
		v[7] = ((a2 * v[9] / a4) >>> 0) + v[8];
		
		result = (v[5] ^ v[7]) >>> 0;
		
		if(!(((v[5] ^ v[7]) & 0x40000000) >>> 0)) {
			if(!((result & 0x7F800000) >>> 0)) {
				do
				{
					v[10] = data[3];
					
					v[7] <<= 8;
					//v[5] = ((v[5] << 8) | 0xFF) >>> 0;
					v[5] <<= 8;
					v[5] |= 0xFF;
					
					if(v[10] < 8) 
					{
						//v[13] = (data[0] >>> ((8 - (v[10] & 0xFF)))) >>> 0;
						
						v[13] = rt.get_dword_ptr(data[0]) >>> 0;
						v[13] >>>= 8 - (v[10] & 0xFF);
						
						//v[11] = ((data[2] | rt.get_dword_ptr(data[0]) << v[10]) & 0xFF) >>> 0;
						
						v[11] = data[2];
						v[11] |= (rt.get_dword_ptr(data[0]) << v[10]) >>> 0;
						v[11] &= 0xFF;
						
						v[12] = v[10] + 24;
						v[14] = data[0] + 4;
						data[2] = v[13];
						v[6] = v[31];
						data[0] = v[14];
					} 
					else 
					{
						v[11] = data[2] & 0xFF;
						data[2] >>>= 8;
						v[12] = (v[10] - 8) >>> 0;
					}
					
					data[3] = v[12];
					v[15] = byte_1002A4B4[v[11] & 0xF];
					v[16] = byte_1002A4B4[v[11] >>> 4];
					result = (v[5] ^ v[7]) >>> 0;
					
					//v[6] = (v[16] | 16 * (16 * v[6] | v[15])) >>> 0;
					
					v[6] <<= 4;
					v[6] |= v[15];
					v[6] <<= 4;
					v[6] |= v[16];
					
					v[31] = v[6];
				}
				while(!((((v[5] ^ v[7]) >>> 0) & 0x7F800000) >>> 0));
			}
			if(!(((v[5] ^ v[7]) & 0x7F800000) >>> 0)) {
				v[17] = data[3];
				
				//v[7] *= 16;
				//v[5] = (16 * v[5] | 0xF) >>> 0;
								
				v[7] <<= 4;
				v[5] <<= 4;
				v[5] |= 0xF;
								
				if(v[17] < 4) {
					v[19] = rt.get_dword_ptr(data[0]) >>> 0;
					v[32] = v[19];
					
					//v[20] = data[2] | (v[19] << v[17]);
					
					v[20] = data[2];
					v[20] |= (v[19] << v[17]) >>> 0;
					
					data[3] += 28;
					v[18] = v[20] & 0xF;
					v[21] = data[0] + 4;
					data[2] = (v[32] >>> (4 - v[17] & 0xFF)) >>> 0;
					data[0] = v[21];
				}
				else {
					v[18] = (data[2] & 0xF) >>> 0;
					data[2] >>>= 4;
					data[3] = v[17] - 4;
				}
				result = 0xFF & byte_1002A4B4[v[18]];
				
				//v[6] = result | 16 * v[6];
				v[6] <<= 4;
				v[6] |= result;
			}
			for (; !((v[5] ^ v[7]) & 0x40000000); result = v[5] ^ v[7]) {
				v[22] = data[3];
				v[7] <<= 1;
				
				//v[5] = ((2 * v[5]) | 1) >>> 0;
				v[5] <<= 1;
				v[5] |= 1;
				
				if (v[22]) {
					v[24] = data[2] & 1;
					data[2] >>>= 1;
					data[3] = v[22] - 1;
					v[23] = v[24];
				}
				else {
					v[25] = rt.get_dword_ptr(data[0]) >>> 0;
					v[26] = rt.get_dword_ptr(data[0]) >>> 1;
					data[0] += 4;
					data[2] = v[26];
					data[3] = 31;
					v[23] = (v[25] & 1) >>> 0;
				}
				//v[6] = (v[23] | 2 * v[6]) >>> 0;
				v[6] <<= 1;
				v[6] |= v[23];
			}
		}
		//for (; (v[7] & 0x20000000) >>> 0; v[6] = (result | 2 * v[28]) >>> 0) {
		for (; (v[7] & 0x20000000) >>> 0;) {
			
			if ((v[5] & 0x20000000) >>> 0)
				break;
			
			v[7] = (v[7] & 0x1FFFFFFF) << 1;
			v[5] = (v[5] << 1) | 0x40000001;
			
			if ( data[3] )
			{
				v[29] = data[2] & 1;
				data[2] = data[2] >>> 1;
				data[3] -= 1;
				result = v[29];
			}
			else
			{
				v[30] = rt.get_dword_ptr(data[0]);
				data[0] += 4;
				data[2] = v[30] >>> 1;
				data[3] = 31;
				result = v[30] & 1;
			}
			
			v[6] = ((v[6] ^ 0x20000000) << 1) | result;
			
		}
		
		data[5] = v[7] & 0x7FFFFFFF;
		data[4] = v[5] & 0x7FFFFFFF;
		data[6] = v[6] & 0x7FFFFFFF;
		
		rt.cpu.reg32[reg_eax] = result;
		rt.instruction_ret(0); // this is cdecl, don't fix stack
		
	};


	// See granny2.def.js
	Granny2.imports = {};
	Granny2.exports = {};

	exports.Granny2 = Granny2;

	Granny2.import_offsets = {                    
		0x1002A000: "GetSystemDirectoryA",
		0x1002A004: "DeleteFileA",
		0x1002A008: "CloseHandle",
		0x1002A00C: "CreateFileA",
		0x1002A010: "ReadFile",
		0x1002A014: "WriteFile",
		0x1002A018: "HeapAlloc",
		0x1002A01C: "GetProcessHeap",
		0x1002A020: "HeapFree",
		0x1002A024: "DisableThreadLibraryCalls",
		0x1002A028: "GetWindowsDirectoryA",
		0x1002A02C: "GetModuleFileNameA",
		0x1002A030: "QueryPerformanceCounter",
		0x1002A034: "QueryPerformanceFrequency",
		0x1002A038: "Sleep",
		0x1002A03C: "LocalFree",
		0x1002A040: "FormatMessageA", 
		0x1002A044: "GetLastError",  
		0x1002A048: "SetFilePointer",
		0x1002A050: "MessageBoxA"
	};

	Granny2.exports = {
		"GrannyAbortFile": 0x10027370,
		"GrannyAccumulateLocalTransform": 0x10027A40,
		"GrannyAccumulateModelAnimations": 0x10026410,
		"GrannyAddBone": 0x10028540,
		"GrannyAddIntegerMember": 0x10028E80,
		"GrannyAddReferenceMember": 0x10028EE0,
		"GrannyAddScalarArrayMember": 0x10028EA0,
		"GrannyAddScalarMember": 0x10028E60,
		"GrannyAddStringMember": 0x10028EC0,
		"GrannyAddTextEntry": 0x10028BF0,
		"GrannyAddToCRC32": 0x10027030,
		"GrannyAddWeight": 0x100281E0,
		"GrannyAdjustFileFixup": 0x10027460,
		"GrannyAlignWriter": 0x100277A0,
		"GrannyAllocationsBegin":0x10027D20 ,
		"GrannyAllocationsEnd":0x10027D40 ,
		"GrannyAnimationType": 0x10035FE8,
		"GrannyArtToolInfoType": 0x10035FEC,
		"GrannyBGR555PixelFormat": 0x10035FD0,
		"GrannyBGR565PixelFormat": 0x10035FD4,
		"GrannyBGR888PixelFormat": 0x10035FE0,
		"GrannyBGRA4444PixelFormat": 0x10035FDC,
		"GrannyBGRA5551PixelFormat": 0x10035FD8,
		"GrannyBGRA8888PixelFormat": 0x10035FE4,
		"GrannyBeginAllocationCheck":0x10027D70 ,
		"GrannyBeginBestMatchS3TCTexture": 0x10028800,
		"GrannyBeginBinkTexture": 0x10028820,
		"GrannyBeginCRC32": 0x10027020,
		"GrannyBeginControlledAnimation": 0x10026F20,
		"GrannyBeginFile": 0x10027310,
		"GrannyBeginFileCompression": 0x10027500,
		"GrannyBeginFileDataTreeWriting": 0x10027120,
		"GrannyBeginLocalPoseAccumulation": 0x10027A20,
		"GrannyBeginMesh": 0x10028050,
		"GrannyBeginRawTexture": 0x100287C0,
		"GrannyBeginS3TCTexture": 0x100287E0,
		"GrannyBeginSampledAnimation": 0x10028C20,
		"GrannyBeginSkeleton": 0x100284E0,
		"GrannyBeginStringTable": 0x100285E0,
		"GrannyBeginTrackGroup": 0x10028A80,
		"GrannyBeginVariant": 0x10028DE0,
		"GrannyBeginWriterCRC": 0x10027770,
		"GrannyBoneBindingType": 0x10036018,
		"GrannyBoneType": 0x10036034,
		"GrannyBuildCameraMatrices": 0x100269E0,
		"GrannyBuildCompositeTransform4x4": 0x100261C0,
		"GrannyBuildCompositeTransform": 0x100261A0,
		"GrannyBuildInverse": 0x10026160,
		"GrannyBuildMeshBinding4x4Array": 0x10028000,
		"GrannyBuildSkeletonRelativeTransform": 0x10028460,
		"GrannyBuildSkeletonRelativeTransforms": 0x10028490,
		"GrannyBuildWorldPose": 0x10029140,
		"GrannyCameraInfoType": 0x10036030,
		"GrannyCheckedAllocationsEnd": 0x10027D80,
		"GrannyClearArena": 0x10027E00,
		"GrannyClearMostSeriousMessage":0x10027BA0 ,
		"GrannyClipTransformDOFs": 0x100271F0,
		"GrannyColumnMatrixMultiply4x3": 0x10027BF0,
		"GrannyColumnMatrixMultiply4x4": 0x10027C10,
		"GrannyCompleteControlAt": 0x10026BD0,
		"GrannyCompressContentsOfFile": 0x10027520,
		"GrannyComputeBasisConversion": 0x100265B0,
		"GrannyComputePeriodicLoopLog": 0x10028400,
		"GrannyComputePeriodicLoopVector": 0x100283E0,
		"GrannyConstructBSplineBuffers": 0x10026900,
		"GrannyControlIsActive": 0x10026D60,
		"GrannyControlIsComplete": 0x10026C40,
		"GrannyControlModelsBegin": 0x10026390,
		"GrannyControlModelsEnd": 0x100263A0,
		"GrannyControlModelsNext": 0x10028E20,
		"GrannyConvertIndices": 0x10028DB0,
		"GrannyConvertPixelFormat": 0x10026550,
		"GrannyConvertSingleObject": 0x10027080,
		"GrannyConvertTree": 0x100270C0,
		"GrannyConvertTreeInPlace": 0x10027100,
		"GrannyConvertVertexLayouts": 0x10028F50,
		"GrannyCopyMeshIndices": 0x10027F20,
		"GrannyCopyMeshVertices": 0x10027EB0,
		"GrannyCopyTextureImage": 0x10028770,
		"GrannyCopyTrackMask": 0x10028D60,
		"GrannyCreateMemoryFileReader": 0x10027E40,
		"GrannyCreatePlatformFileReader": 0x10027670,
		"GrannyCurveIsUncompressed": 0x10026480,
		"GrannyCurveType": 0x10035FB0,
		"GrannyDecodeGRNReference": 0x10027600,
		"GrannyDecompressData": 0x100274D0,
		"GrannyDecompressIGCTexture": 0x10027800,
		"GrannyDeformVertices": 0x10028370,
		"GrannyDeleteFileWriter": 0x100276D0,
		"GrannyEaseControlIn": 0x10026EA0,
		"GrannyEaseControlOut": 0x10026EC0,
		"GrannyEmptyType": 0x10035F80,
		"GrannyEncodeImage": 0x100288A0,
		"GrannyEndAllocationCheck": 0x10027D90,
		"GrannyEndCRC32": 0x10027050,
		"GrannyEndControlledAnimation": 0x10026F40,
		"GrannyEndFile": 0x10027330,
		"GrannyEndFileCompression": 0x10027550,
		"GrannyEndFileDataTreeWriting": 0x10027140,
		"GrannyEndFileToWriter": 0x10027350,
		"GrannyEndLocalPoseAccumulation": 0x10027A60,
		"GrannyEndMesh": 0x10028080,
		"GrannyEndMeshInPlace": 0x100280F0,
		"GrannyEndSampledAnimation": 0x10028C40,
		"GrannyEndSkeleton": 0x100284F0,
		"GrannyEndSkeletonInPlace": 0x10028520,
		"GrannyEndStringTable": 0x10028600,
		"GrannyEndStringTableInPlace": 0x10028620,
		"GrannyEndTexture": 0x10028840,
		"GrannyEndTextureInPlace": 0x10028860,
		"GrannyEndTrackGroup": 0x10028AA0,
		"GrannyEndTrackGroupInPlace": 0x10028AC0,
		"GrannyEndVariant": 0x10028DF0,
		"GrannyEndVariantInPlace": 0x10028E30,
		"GrannyEndWriterCRC": 0x10027790,
		"GrannyEnsureExactOneNorm": 0x10028F80,
		"GrannyEnsureQuaternionContinuity": 0x10027BB0,
		"GrannyExporterInfoType": 0x10035FF0,
		"GrannyFileCRCIsValid": 0x10027210,
		"GrannyFileInfoType": 0x10035FFC,
		"GrannyFilterAllMessages": 0x10027B70,
		"GrannyFilterMessage": 0x10027B50,
		"GrannyFindBoneByName": 0x100284C0,
		"GrannyFindCloseKnot": 0x100268E0,
		"GrannyFindKnot": 0x100268C0,
		"GrannyFindMatchingMember": 0x10027060,
		"GrannyFindTrackGroupForModel": 0x10026590,
		"GrannyFitBSplineToSamples": 0x10026940,
		"GrannyFitPeriodicLoop": 0x100283B0,
		"GrannyFixupFileSection": 0x100272C0,
		"GrannyFreeAllFileSections": 0x10027290,
		"GrannyFreeBuilderResult": 0x10027DE0,
		"GrannyFreeCompletedModelControls": 0x10026400,
		"GrannyFreeControl": 0x10026BB0,
		"GrannyFreeControlIfComplete": 0x10026C50,
		"GrannyFreeControlOnceUnused": 0x10026BC0,
		"GrannyFreeFile": 0x100272E0,
		"GrannyFreeFileSection": 0x10027270,
		"GrannyFreeLocalPose": 0x100279C0,
		"GrannyFreeMemoryArena": 0x10027E10,
		"GrannyFreeMeshBinding": 0x10027F80,
		"GrannyFreeMeshDeformer": 0x10028360,
		"GrannyFreeModelInstance": 0x100263C0,
		"GrannyFreeTrackMask": 0x10028D50,
		"GrannyFreeWorldPose": 0x100290B0,
		"GrannyGRNFileMV": 0x10035FF4,
		"GrannyGRNFixUp": 0x100275C0,
		"GrannyGRNMarshall": 0x100275E0,
		"GrannyGetAllocationInformation": 0x10027D50,
		"GrannyGetAllocator": 0x10027DA0,
		"GrannyGetAttachmentOffset": 0x10027AD0,
		"GrannyGetCameraBack": 0x10026AB0,
		"GrannyGetCameraDown": 0x10026A70,
		"GrannyGetCameraForward": 0x10026A90,
		"GrannyGetCameraLeft": 0x10026A10,
		"GrannyGetCameraLocation": 0x100269F0,
		"GrannyGetCameraRelativePlanarBases": 0x10026B60,
		"GrannyGetCameraRight": 0x10026A30,
		"GrannyGetCameraUp": 0x10026A50,
		"GrannyGetCompressedBytesPaddingSize": 0x100274C0,
		"GrannyGetControlClampedLocalClock": 0x10026D90,
		"GrannyGetControlClock": 0x10026BF0,
		"GrannyGetControlDuration": 0x10026D40,
		"GrannyGetControlDurationLeft": 0x10026D50,
		"GrannyGetControlEaseCurveMultiplier": 0x10026DB0,
		"GrannyGetControlEffectiveWeight": 0x10026DC0,
		"GrannyGetControlFromBinding": 0x100290C0,
		"GrannyGetControlLocalDuration": 0x10026DA0,
		"GrannyGetControlLoopCount": 0x10026C90,
		"GrannyGetControlLoopIndex": 0x10026CE0,
		"GrannyGetControlLoopState": 0x10026CC0,
		"GrannyGetControlRawLocalClock": 0x10026E70,
		"GrannyGetControlSpeed": 0x10026D10,
		"GrannyGetControlUserDataArray": 0x10026EE0,
		"GrannyGetControlWeight": 0x10026C60,
		"GrannyGetConvertedTreeSize": 0x100270E0,
		"GrannyGetCounterCount":0x10028590 ,
		"GrannyGetCounterResults": 0x100285C0,
		"GrannyGetDataTreeFromFile": 0x100272F0,
		"GrannyGetDefaultFileReaderOpenCallback":0x10027690 ,
		"GrannyGetFileInfo": 0x10027620,
		"GrannyGetFileTypeTag": 0x10027300,
		"GrannyGetGRNSectionArray": 0x10027590,
		"GrannyGetGrannyHeadBezier": 0x100277E0,
		"GrannyGetGrannyHeadBezierCount":0x100277D0 ,
		"GrannyGetGrannyHeadWidthOverHeight":0x100277C0 ,
		"GrannyGetIGCInfo": 0x100277F0,
		"GrannyGetLocalPoseBoneCount": 0x100290C0,
		"GrannyGetLocalPoseFillThreshold": 0x10027A90,
		"GrannyGetLocalPoseTransform": 0x10027A00,
		"GrannyGetLogCallback":0x10027B20 ,
		"GrannyGetMappedString": 0x10028640,
		"GrannyGetMaterialTextureByType": 0x10026340,
		"GrannyGetMemberArrayWidth": 0x100262D0,
		"GrannyGetMemberCTypeName": 0x10026230,
		"GrannyGetMemberMarshalling": 0x10026260,
		"GrannyGetMemberTypeName": 0x10026220,
		"GrannyGetMemberTypeSize": 0x100261F0,
		"GrannyGetMemberUnitSize": 0x100261E0,
		"GrannyGetMeshBinding4x4ArraySize": 0x10027FE0,
		"GrannyGetMeshBindingBoneCount": 0x10028030,
		"GrannyGetMeshBindingFromBoneIndices": 0x10028040,
		"GrannyGetMeshBindingToBoneIndices": 0x10026370,
		"GrannyGetMeshBytesPerIndex": 0x10027F00,
		"GrannyGetMeshIndexCount": 0x10027EF0,
		"GrannyGetMeshIndices": 0x10027F10,
		"GrannyGetMeshTriangleGroupCount": 0x10027E70,
		"GrannyGetMeshTriangleGroups": 0x10027E80,
		"GrannyGetMeshVertexCount": 0x10027EA0,
		"GrannyGetMeshVertexType": 0x10027E90,
		"GrannyGetMeshVertices": 0x10027ED0,
		"GrannyGetModelInitialPlacement4x4": 0x10026320,
		"GrannyGetModelInstanceFromBinding": 0x10028040,
		"GrannyGetModelUserDataArray": 0x10026470,
		"GrannyGetMostLikelyPhysicalAspectRatio": 0x10026B90,
		"GrannyGetMostSeriousMessage":0x10027B90 ,
		"GrannyGetMostSeriousMessageType":0x10027B80 ,
		"GrannyGetObjectMarshalling": 0x10026270,
		"GrannyGetOrientationSamples": 0x10028C70,
		"GrannyGetPickingRay": 0x10026B30,
		"GrannyGetPositionSamples": 0x10028C50,
		"GrannyGetRawImageSize": 0x10028710,
		"GrannyGetRecommendedPixelLayout": 0x10028750,
		"GrannyGetResultingCoincidentVertexMap": 0x100280B0,
		"GrannyGetResultingLocalPoseSize": 0x100279D0,
		"GrannyGetResultingMeshBindingSize": 0x10027F90,
		"GrannyGetResultingSkeletonSize": 0x10028510,
		"GrannyGetResultingStringTableSize": 0x10028610,
		"GrannyGetResultingTextureSize": 0x10028850,
		"GrannyGetResultingTopologySize": 0x100280E0,
		"GrannyGetResultingTrackGroupSize": 0x10028AB0,
		"GrannyGetResultingVariantObjectSize": 0x10028E20,
		"GrannyGetResultingVariantTypeSize": 0x10028E10,
		"GrannyGetResultingVertexCount": 0x100280A0,
		"GrannyGetResultingVertexDataSize": 0x100280D0,
		"GrannyGetResultingVertexToTriangleMap": 0x100280C0,
		"GrannyGetResultingWorldPoseSize": 0x100290D0,
		"GrannyGetS3TCImageSize": 0x10028730,
		"GrannyGetS3TCPixelLayout": 0x10028440,
		"GrannyGetS3TCTextureFormatName": 0x10028450,
		"GrannyGetScaleShearSamples": 0x10028C90,
		"GrannyGetSecondsElapsed": 0x100286C0,
		"GrannyGetSingleVertex": 0x10029080,
		"GrannyGetSourceModel": 0x100290C0,
		"GrannyGetSourceSkeleton": 0x100263D0,
		"GrannyGetSystemSeconds":0x10028680 ,
		"GrannyGetTextureEncodingName": 0x10028700,
		"GrannyGetTextureTypeName": 0x100286F0,
		"GrannyGetTotalObjectSize": 0x10026200,
		"GrannyGetTotalTypeSize": 0x10026210,
		"GrannyGetTrackGroupInitialPlacement4x4": 0x100288D0,
		"GrannyGetTrackInitialTransform": 0x10028950,
		"GrannyGetTrackMaskBoneWeight": 0x10028D10,
		"GrannyGetTransformDeterminant": 0x10026050,
		"GrannyGetTypeTableCount": 0x100262F0,
		"GrannyGetTypeTableFor": 0x100262E0,
		"GrannyGetVersion": 0x10028F10,
		"GrannyGetVersionString":0x10028F00 ,
		"GrannyGetVertexBoneCount": 0x10029060,
		"GrannyGetVertexChannelCount": 0x10029070,
		"GrannyGetVertexDiffuseColorName": 0x10029010,
		"GrannyGetVertexSpecularColorName": 0x10029030,
		"GrannyGetVertexTextureCoordinatesName": 0x10028FF0,
		"GrannyGetWorldMatrixFromLocalPose": 0x10027AA0,
		"GrannyGetWorldPose4x4": 0x10029100,
		"GrannyGetWorldPose4x4Array": 0x10028030,
		"GrannyGetWorldPoseBoneCount": 0x100290C0,
		"GrannyGetWorldPoseComposite4x4": 0x10029120,
		"GrannyGetWorldPoseComposite4x4Array": 0x10028E20,
		"GrannyGetWriterPosition": 0x100276E0,
		"GrannyIGCFrameType": 0x10036008,
		"GrannyIGCInfoType": 0x1003600C,
		"GrannyIGCMaterialType": 0x10036010,
		"GrannyIGCMeshKeyType": 0x10036004,
		"GrannyIGCTextureType": 0x10036014,
		"GrannyIGCVertexType": 0x10036000,
		"GrannyIKUpdate": 0x10027820,
		"GrannyIdentityTrackMask": 0x10036060,
		"GrannyInPlaceSimilarityTransform4x3": 0x10027D00,
		"GrannyInPlaceSimilarityTransform": 0x10027CD0,
		"GrannyInPlaceSimilarityTransformOrientation": 0x10027C90,
		"GrannyInPlaceSimilarityTransformPosition": 0x10027C70,
		"GrannyInPlaceSimilarityTransformScaleShear": 0x10027CB0,
		"GrannyInitializeDefaultCamera": 0x10026980,
		"GrannyInitializeFileReader": 0x10027630,
		"GrannyInstantiateModel": 0x100263B0,
		"GrannyInt16Type": 0x10035F88,
		"GrannyInt32Type": 0x10035F8C,
		"GrannyInvertTrackMask": 0x10028D70,
		"GrannyInvertTriTopologyWinding": 0x10028D80,
		"GrannyIsGrannyFile": 0x10027570,
		"GrannyIsMixedMarshalling": 0x10026280,
		"GrannyIsSpatialVertexMember": 0x10029050,
		"GrannyKnotsAreReducible": 0x10028A30,
		"GrannyLightInfoType": 0x1003602C,
		"GrannyLogging":0x10027B40 ,
		"GrannyMakeEmptyDataTypeMember": 0x10026290,
		"GrannyMakeEmptyDataTypeObject": 0x100262B0,
		"GrannyMakeIdentity": 0x10026030,
		"GrannyMapString": 0x10028660,
		"GrannyMarkFileFixup": 0x10027440,
		"GrannyMarkFileRootObject": 0x100274A0,
		"GrannyMarkMarshallingFixup": 0x10027480,
		"GrannyMaterialBindingType": 0x1003601C,
		"GrannyMaterialMapType": 0x10035FA8,
		"GrannyMaterialType": 0x10035FAC,
		"GrannyMatrixEqualsQuaternion3x3": 0x10027C30,
		"GrannyMemberHasPointers": 0x10026240,
		"GrannyMemoryArenaPush": 0x10027E20,
		"GrannyMergeSingleObject": 0x100270A0,
		"GrannyMeshBindingIsTransferred": 0x10027FD0,
		"GrannyMeshIsRigid": 0x10027EE0,
		"GrannyMeshType": 0x10036024,
		"GrannyModelControlsBegin": 0x10026360,
		"GrannyModelControlsEnd": 0x10026380,
		"GrannyModelControlsNext": 0x10026370,
		"GrannyModelMeshBindingType": 0x10035FA0,
		"GrannyModelType": 0x10035FA4,
		"GrannyMorphTargetType": 0x10036020,
		"GrannyMoveCameraRelative": 0x100269C0,
		"GrannyMultiply": 0x10026140,
		"GrannyNewFileWriter": 0x100276B0,
		"GrannyNewLocalPose": 0x100279B0,
		"GrannyNewLocalPoseInPlace": 0x100279E0,
		"GrannyNewMemoryArena":0x10027DF0 ,
		"GrannyNewMeshBinding": 0x10027F60,
		"GrannyNewMeshBindingInPlace": 0x10027FB0,
		"GrannyNewMeshDeformer": 0x10028340,
		"GrannyNewTrackMask": 0x10028CF0,
		"GrannyNewWorldPose": 0x100290A0,
		"GrannyNewWorldPoseInPlace": 0x100290E0,
		"GrannyNextAllocation": 0x10027D30,
		"GrannyNullTrackMask": 0x10036064,
		"GrannyOffsetFileLocation": 0x100273F0,
		"GrannyOneNormalizeWeights": 0x10028FA0,
		"GrannyP3VertexType": 0x1003607C,
		"GrannyPN33VertexType": 0x10036080,
		"GrannyPNT332VertexType": 0x10036084,
		"GrannyPWN313VertexType": 0x10036088,
		"GrannyPWN323VertexType": 0x10036090,
		"GrannyPWN343VertexType": 0x10036098,
		"GrannyPWNT3132VertexType": 0x1003608C,
		"GrannyPWNT3232VertexType": 0x10036094,
		"GrannyPWNT3432VertexType": 0x1003609C,
		"GrannyPeriodicLoopType": 0x10036028,
		"GrannyPixelLayoutHasAlpha": 0x100264B0,
		"GrannyPixelLayoutType": 0x10035FB4,
		"GrannyPixelLayoutsAreEqual": 0x10026490,
		"GrannyPlayControlledAnimation": 0x10026F00,
		"GrannyPlayControlledPose": 0x10026FF0,
		"GrannyPolarDecompose": 0x10027BD0,
		"GrannyPostMultiplyBy": 0x10026120,
		"GrannyPreMultiplyBy": 0x10026100,
		"GrannyPredictWriterAlignment": 0x100277B0,
		"GrannyPushSampledFrame": 0x10028CE0,
		"GrannyPushScalarTrack": 0x10028AE0,
		"GrannyPushTextTrack": 0x10028C10,
		"GrannyPushTransformTrack": 0x10028BC0,
		"GrannyPushTriangle": 0x10028330,
		"GrannyPushVertex": 0x10028200,
		"GrannyQuaternionEqualsMatrix3x3": 0x10027C50,
		"GrannyRGB555PixelFormat": 0x10035FB8,
		"GrannyRGB565PixelFormat": 0x10035FBC,
		"GrannyRGB888PixelFormat": 0x10035FC8,
		"GrannyRGBA4444PixelFormat": 0x10035FC4,
		"GrannyRGBA5551PixelFormat": 0x10035FC0,
		"GrannyRGBA8888PixelFormat": 0x10035FCC,
		"GrannyRayIntersectsBox": 0x10027920,
		"GrannyRayIntersectsBoxAt": 0x10027950,
		"GrannyRayIntersectsPlaneAt": 0x100278A0,
		"GrannyRayIntersectsSphere": 0x100278D0,
		"GrannyRayIntersectsSphereAt": 0x100278F0,
		"GrannyRayIntersectsTriangleAt": 0x10027980,
		"GrannyReadEntireFile": 0x10027220,
		"GrannyReadEntireFileFromMemory": 0x10027230,
		"GrannyReadEntireFileFromReader": 0x10027250,
		"GrannyReadFileSection": 0x100272A0,
		"GrannyReadPartialFileFromReader": 0x10027260,
		"GrannyReal32Type": 0x10035F98,
		"GrannyRecenterAllControlClocks": 0x10026EF0,
		"GrannyRemapTopologyMaterials": 0x10028D90,
		"GrannyRemoveTrackInitialTransform": 0x10028970,
		"GrannyResetCounterPeaks":0x100285B0 ,
		"GrannyResetCounters":0x100285A0 ,
		"GrannyReverseSection": 0x100275A0,
		"GrannyReverseTypeArray": 0x10026300,
		"GrannyReversedGRNFileMV": 0x10035FF8,
		"GrannySampleBSpline0x1": 0x10026690,
		"GrannySampleBSpline0x3": 0x100266B0,
		"GrannySampleBSpline0x4": 0x100266D0,
		"GrannySampleBSpline0x9": 0x100266F0,
		"GrannySampleBSpline1x1": 0x10026710,
		"GrannySampleBSpline1x3": 0x10026730,
		"GrannySampleBSpline1x4n": 0x10026750,
		"GrannySampleBSpline1x9": 0x10026770,
		"GrannySampleBSpline2x1": 0x10026790,
		"GrannySampleBSpline2x3": 0x100267B0,
		"GrannySampleBSpline2x4n": 0x100267D0,
		"GrannySampleBSpline2x9": 0x100267F0,
		"GrannySampleBSpline3x1": 0x10026810,
		"GrannySampleBSpline3x3": 0x10026830,
		"GrannySampleBSpline3x4n": 0x10026850,
		"GrannySampleBSpline3x9": 0x10026870,
		"GrannySampleBSpline": 0x10026890,
		"GrannySampleModelAnimations": 0x10026430,
		"GrannyScalarTrackType": 0x1003604C,
		"GrannyScaleImage": 0x10027860,
		"GrannySeekWriterFromCurrentPosition": 0x10027730,
		"GrannySeekWriterFromEnd": 0x10027710,
		"GrannySeekWriterFromStart": 0x100276F0,
		"GrannySetAllocator": 0x10027DC0,
		"GrannySetBinormal": 0x10028290,
		"GrannySetBinormalTolerance": 0x10028160,
		"GrannySetBoneParent": 0x10028570,
		"GrannySetCameraAspectRatios": 0x10026990,
		"GrannySetChannel": 0x100282F0,
		"GrannySetChannelTolerance": 0x100281A0,
		"GrannySetControlActive": 0x10026D70,
		"GrannySetControlClock": 0x10026C00,
		"GrannySetControlClockOnly": 0x10026C20,
		"GrannySetControlEaseIn": 0x10026DD0,
		"GrannySetControlEaseInCurve": 0x10026DF0,
		"GrannySetControlEaseOut": 0x10026E20,
		"GrannySetControlEaseOutCurve": 0x10026E40,
		"GrannySetControlLoopCount": 0x10026CA0,
		"GrannySetControlLoopIndex": 0x10026CF0,
		"GrannySetControlRawLocalClock": 0x10026E80,
		"GrannySetControlSpeed": 0x10026D20,
		"GrannySetControlWeight": 0x10026C70,
		"GrannySetDefaultFileReaderOpenCallback": 0x100276A0,
		"GrannySetFileDataTreeFlags": 0x10027150,
		"GrannySetFileSectionForObject": 0x10027190,
		"GrannySetFileSectionForObjectsOfType": 0x10027170,
		"GrannySetFileSectionFormat": 0x10027380,
		"GrannySetImageScalingFilter": 0x10028880,
		"GrannySetLocalPoseFillThreshold": 0x10028160,
		"GrannySetLogCallback": 0x10027B30,
		"GrannySetLogFileName": 0x10027B00,
		"GrannySetMaterial": 0x10028310,
		"GrannySetModelClock": 0x100263E0,
		"GrannySetNormal": 0x10028230,
		"GrannySetNormalTolerance": 0x10028120,
		"GrannySetPosition": 0x100281C0,
		"GrannySetStockBGRASpecification": 0x10026510,
		"GrannySetStockRGBASpecification": 0x100264E0,
		"GrannySetStockSpecification": 0x100264C0,
		"GrannySetTangent": 0x10028260,
		"GrannySetTangentBinormalCross": 0x100282C0,
		"GrannySetTangentBinormalCrossTolerance": 0x10028180,
		"GrannySetTangentTolerance": 0x10028140,
		"GrannySetTextTrackName": 0x10028BD0,
		"GrannySetTrackGroupAccumulation": 0x10026FD0,
		"GrannySetTrackGroupBasisTransform": 0x10026F70,
		"GrannySetTrackGroupModelMask": 0x10026FB0,
		"GrannySetTrackGroupTarget": 0x10026F50,
		"GrannySetTrackGroupTrackMask": 0x10026F90,
		"GrannySetTrackMaskBoneWeight": 0x10028D30,
		"GrannySetTransform": 0x10025FF0,
		"GrannySetTransformSample": 0x10028CB0,
		"GrannySetTransformTrackName": 0x10028B10,
		"GrannySetTransformTrackOrientation": 0x10028B60,
		"GrannySetTransformTrackPosition": 0x10028B30,
		"GrannySetTransformTrackScaleShear": 0x10028B90,
		"GrannySetTransformWithIdentityCheck": 0x10026010,
		"GrannySetVertexIndex": 0x10028210,
		"GrannySimilarityTransform": 0x10026180,
		"GrannySimilarityTransformCurve3": 0x10028980,
		"GrannySimilarityTransformCurve3x3": 0x100289E0,
		"GrannySimilarityTransformCurve4": 0x100289B0,
		"GrannySimilarityTransformTrackGroup": 0x10028A10,
		"GrannySkeletonType": 0x10036038,
		"GrannySleepForSeconds": 0x100286E0,
		"GrannyStepPeriodicLoop": 0x10028420,
		"GrannyStringTableType": 0x1003603C,
		"GrannyStringType": 0x10035F84,
		"GrannySwapRGBAToBGRA": 0x10026540,
		"GrannyTextTrackEntryType": 0x10036054,
		"GrannyTextTrackType": 0x10036058,
		"GrannyTextureHasAlpha": 0x100287B0,
		"GrannyTextureImageType": 0x10036044,
		"GrannyTextureMIPLevelType": 0x10036040,
		"GrannyTextureType": 0x10036048,
		"GrannyTrackGroupType": 0x1003605C,
		"GrannyTransformAnimation": 0x10026650,
		"GrannyTransformBoundingBox": 0x10027F40,
		"GrannyTransformCurve3": 0x100288F0,
		"GrannyTransformCurve3x3": 0x10028930,
		"GrannyTransformCurve4": 0x10028910,
		"GrannyTransformFile": 0x10026670,
		"GrannyTransformMesh": 0x100265F0,
		"GrannyTransformModel": 0x10026630,
		"GrannyTransformPoint": 0x100260E0,
		"GrannyTransformPointInPlace": 0x100260C0,
		"GrannyTransformSkeleton": 0x10026610,
		"GrannyTransformTrackHasUncompressedCurves": 0x10028A70,
		"GrannyTransformTrackType": 0x10036050,
		"GrannyTransformType": 0x10035F9C,
		"GrannyTransformVector": 0x100260A0,
		"GrannyTransformVectorInPlace": 0x10026060,
		"GrannyTransformVectorInPlaceTransposed": 0x10026080,
		"GrannyTransformVertices": 0x10028FC0,
		"GrannyTriAnnotationSetType": 0x1003606C,
		"GrannyTriMaterialGroupType": 0x10036068,
		"GrannyTriTopologyType": 0x10036070,
		"GrannyTypeHasPointers": 0x10026250,
		"GrannyUInt32Type": 0x10035F94,
		"GrannyUInt8Type": 0x10035F90,
		"GrannyUnlinkFileReader": 0x10027660,
		"GrannyUpdateModelMatrix": 0x10026450,
		"GrannyVersionsMatch_": 0x10028F30,
		"GrannyVertexAnnotationSetType": 0x10036074,
		"GrannyVertexDataType": 0x10036078,
		"GrannyVertexWeightArraysType": 0x100360A0,
		"GrannyWindowSpaceToWorldSpace": 0x10026AD0,
		"GrannyWorldSpaceToWindowSpace": 0x10026B00,
		"GrannyWrite": 0x10027750,
		"GrannyWriteDataTreeToFile": 0x100271D0,
		"GrannyWriteDataTreeToFileBuilder": 0x100271B0,
		"GrannyWriteFileChunk": 0x100273A0,
		"GrannyWriterIsCRCing": 0x10027780,
		"GrannyZeroPeriodicLoop": 0x100283A0,
		"GrannyZeroTransform": 0x10026040,
		"DllEntryPoint": 0x10021640
	};

})(this)