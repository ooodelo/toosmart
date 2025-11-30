import React, { useRef, useEffect, useState } from 'react';
import { VERTEX_SHADER } from '../constants';

interface WebGLViewProps {
  fragmentShader: string;
  className?: string;
}

const WebGLView: React.FC<WebGLViewProps> = ({ fragmentShader, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number>(Date.now());
  const programRef = useRef<WebGLProgram | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  
  // Track dimensions internally
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Handle Resizing
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { 
        alpha: true, // Crucial for transparency
        premultipliedAlpha: false 
    });
    
    if (!gl) return;
    glRef.current = gl;

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShader);

    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    programRef.current = program;

    // Full screen quad buffer
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    return () => {
        if (programRef.current && glRef.current) {
            glRef.current.deleteProgram(programRef.current);
        }
    }
  }, [fragmentShader]);

  // Animation Loop
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || dimensions.width === 0 || dimensions.height === 0) return;

    const render = () => {
      if (!gl || !programRef.current) return;

      gl.viewport(0, 0, dimensions.width, dimensions.height);
      gl.useProgram(programRef.current);

      const uTime = gl.getUniformLocation(programRef.current, 'u_time');
      const uResolution = gl.getUniformLocation(programRef.current, 'u_resolution');

      const currentTime = (Date.now() - startTimeRef.current) / 1000.0;

      gl.uniform1f(uTime, currentTime);
      gl.uniform2f(uResolution, dimensions.width, dimensions.height);

      // Clear with transparent black
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [dimensions.width, dimensions.height]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className || ''}`}>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="block w-full h-full pointer-events-none"
      />
    </div>
  );
};

export default WebGLView;