

// Common vertex shader for a full-screen quad
export const VERTEX_SHADER = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Advanced Fluid Shader: Infinite Grid-based Procedural Generation
export const FRAGMENT_SHADER_FLUID = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;

  // Simplex 2D noise
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Pseudo-random hash for grid cell ID
  vec2 hash2(vec2 p) {
      p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
      return fract(sin(p)*43758.5453123);
  }

  void main() {
      // Coordinate System: Fixed Scale & Top-Left Origin
      // Was 350.0, changed to 180.0 to make islands smaller and more numerous (not big chunks)
      vec2 screenPos = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
      vec2 uv = screenPos / 180.0;
      
      float t = u_time * 0.35; // Increased speed further for dynamic movement
      
      // Domain Warping for organic "uneven" shape across the infinite field
      vec2 pWarp = uv;
      // Increased noise frequency (1.0 -> 1.5) for more fragmented details
      float n = snoise(pWarp * 1.5 + t * 0.3);
      pWarp.x += n * 0.2;
      pWarp.y += snoise(pWarp * 1.2 - t * 0.35) * 0.2;

      // Infinite Grid Generation
      vec2 gridId = floor(pWarp);
      vec2 gridUv = fract(pWarp) - 0.5; // Local coordinates within cell, centered
      
      float v = 0.0;
      
      // Iterate through 3x3 neighbor cells to calculate influence
      // This ensures smooth transitions between "islands"
      for(float y = -1.0; y <= 1.0; y++) {
          for(float x = -1.0; x <= 1.0; x++) {
              vec2 neighbor = vec2(x, y);
              vec2 cellId = gridId + neighbor;
              
              // Unique random seed for this grid cell
              vec2 r = hash2(cellId);
              
              // Epicenter Position: Drifting randomly within the cell
              vec2 centerAnim = vec2(
                  sin(t * 0.7 + r.x * 6.28) * 0.6,
                  cos(t * 0.6 + r.y * 6.28) * 0.6
              );
              vec2 center = neighbor + centerAnim; 
              
              // Generate a cluster of blobs for this cell's epicenter
              for(int i = 0; i < 4; i++) {
                  float fi = float(i);
                  
                  // Orbit logic relative to the drifting center
                  float angle = t * (0.5 + r.x * 0.5) + fi * 2.5;
                  float radius = 0.15 + 0.1 * sin(t + fi * 10.0 + r.y * 5.0);
                  
                  vec2 blobOffset = vec2(cos(angle), sin(angle)) * radius;
                  
                  // Distance from current pixel to this blob
                  float d = length(gridUv - (center + blobOffset));
                  
                  // Pulsating size
                  float blobSize = 0.5 + 0.2 * sin(fi * 4.0 + t * 2.0 + r.x * 10.0);
                  
                  // Accumulate density field
                  // Adjusted attenuation for grid density
                  v += blobSize / (d * d * 16.0 + 0.5);
              }
          }
      }
      
      // Increase density substantially (1.3 -> 1.65) to reduce voids by ~50%
      v *= 1.65;
      
      // Transparency & Edge Logic (Soft Gradient)
      
      // Detailed noise for smoky edges
      float edgeNoise = snoise(uv * 3.0 - t * 1.0);
      
      // Main Body (Opaque Peaks)
      // High density areas become fully opaque
      float alpha = smoothstep(0.6 + 0.1 * edgeNoise, 2.5, v);
      
      // Secondary "Splash" layer (Mist/Smoke)
      // Captures lower density areas to create soft connections
      float splash = smoothstep(0.2, 1.0, v) * 0.5;
      
      // Combine
      float finalAlpha = alpha + splash * (1.0 - alpha);
      
      // Outer Glow
      float glow = smoothstep(0.05, 0.5, v) * 0.1;
      finalAlpha += glow * (1.0 - finalAlpha);

      finalAlpha = clamp(finalAlpha, 0.0, 1.0);
      
      // Fluid Color: #f5f5f5 (matches background to hide text)
      // 245 / 255 = 0.9607
      vec3 color = vec3(0.9607, 0.9607, 0.9607);
      
      // Output
      gl_FragColor = vec4(color * finalAlpha, finalAlpha);
  }
`;