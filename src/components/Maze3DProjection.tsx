import { useEffect, useMemo, useRef, useState } from 'react';
import type { Direction, MazeState, MazeTextureId } from '../domain/types';
import { cellKey } from '../domain/maze/key';
import { movePosition } from '../domain/maze/movement';
import { createMazeVisibilitySnapshot } from '../domain/maze/visibility';
import { projectMaze3D, PROJECTION_CELL_SIZE, PROJECTION_DOOR_HEIGHT, PROJECTION_DOOR_WIDTH, PROJECTION_WALL_HEIGHT, type ProjectedCell3D } from './maze3d/projection';
import flagstoneUrl from '../assets/textures/dark-flagstone.jpg';
import cobbleUrl from '../assets/textures/cobble-small.jpg';
import roughUrl from '../assets/textures/slab-rough.jpg';
import mixedUrl from '../assets/textures/block-mixed.jpg';
import brickUrl from '../assets/textures/brick-worn.jpg';

type Surface = 'floor' | 'wall' | 'ceiling';
type Vec3 = [number, number, number];
type Scene = Record<Surface, Float32Array>;
type DirectionVector = { x: number; z: number };
const order: Direction[] = ['north', 'east', 'south', 'west'];
const surfaceOrder: Surface[] = ['floor', 'wall', 'ceiling'];
const directions: Record<Direction, DirectionVector> = {
  north: { x: 0, z: -1 }, east: { x: 1, z: 0 },
  south: { x: 0, z: 1 }, west: { x: -1, z: 0 },
};

const floorSources: Record<MazeTextureId, string> = {
  procedural: flagstoneUrl, 'dark-flagstone': flagstoneUrl, 'cobble-small': cobbleUrl,
  'slab-rough': roughUrl, 'block-mixed': mixedUrl, 'brick-worn': brickUrl,
};
const textureSources: Record<Surface, string> = {
  floor: flagstoneUrl, wall: brickUrl, ceiling: roughUrl,
};

const vertexSource = [
  '#version 300 es',
  'precision highp float;',
  'in vec3 aPosition;',
  'in vec2 aUV;',
  'uniform vec3 uEye;',
  'uniform vec2 uForward;',
  'uniform float uAspect;',
  'out vec2 vUV;',
  'out float vDepth;',
  'void main() {',
  '  vec3 p = aPosition - uEye;',
  '  vec2 right = vec2(-uForward.y, uForward.x);',
  '  float depth = dot(p.xz, uForward);',
  '  gl_Position = vec4(dot(p.xz, right) * 1.35 / uAspect, p.y * 1.35, depth * 1.002 - 0.2002, depth);',
  '  vUV = aUV;',
  '  vDepth = depth;',
  '}',
].join('\n');

const fragmentSource = [
  '#version 300 es',
  'precision highp float;',
  'in vec2 vUV;',
  'in float vDepth;',
  'uniform sampler2D uTexture;',
  'uniform float uShade;',
  'out vec4 fragColor;',
  'void main() {',
  '  vec3 material = texture(uTexture, vUV).rgb * uShade;',
  '  float fog = clamp((vDepth - 13.0) / 29.0, 0.0, 0.91);',
  '  fragColor = vec4(mix(material, vec3(0.025, 0.037, 0.069), fog), 1.0);',
  '}',
].join('\n');

function quad(target: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3, width: number, height: number) {
  // Independent UVs per face, not a shared world texture coordinate system.
  const u = width / 2;
  const v = height / 2;
  const vertices: Array<[Vec3, number, number]> = [
    [a, 0, 0], [b, u, 0], [c, u, v],
    [a, 0, 0], [c, u, v], [d, 0, v],
  ];
  for (const [p, tx, ty] of vertices) target.push(p[0], p[1], p[2], tx, ty);
}

function buildScene(cells: ProjectedCell3D[]): Scene {
  const values: Record<Surface, number[]> = { floor: [], wall: [], ceiling: [] };
  const present = new Set(cells.map(cellKey));
  const size = PROJECTION_CELL_SIZE;
  const half = size / 2;
  for (const cell of cells) {
    const x0 = cell.column * size - half;
    const z0 = cell.row * size - half;
    const x1 = x0 + size;
    const z1 = z0 + size;
    const h = PROJECTION_WALL_HEIGHT;
    quad(values.floor, [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], size, size);
    quad(values.ceiling, [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], size, size);

    for (const direction of order) {
      // A shared boundary has exactly one surface owner: avoid overlapping walls.
      if ((direction === 'east' || direction === 'south') &&
        present.has(cellKey(movePosition(cell, direction)))) continue;
      if (cell.exits[direction] === 'open') continue;

      let from: [number, number];
      let to: [number, number];
      switch (direction) {
        case 'north': from = [x0, z0]; to = [x1, z0]; break;
        case 'south': from = [x1, z1]; to = [x0, z1]; break;
        case 'east': from = [x1, z0]; to = [x1, z1]; break;
        case 'west': from = [x0, z1]; to = [x0, z0]; break;
      }
      const panel = (begin: number, end: number, bottom: number, top: number) => {
        const ax = from[0] + (to[0] - from[0]) * begin;
        const az = from[1] + (to[1] - from[1]) * begin;
        const bx = from[0] + (to[0] - from[0]) * end;
        const bz = from[1] + (to[1] - from[1]) * end;
        quad(values.wall, [ax, bottom, az], [bx, bottom, bz],
          [bx, top, bz], [ax, top, az], size * (end - begin), top - bottom);
      };
      if (cell.exits[direction] === 'doorway') {
        const edge = (1 - PROJECTION_DOOR_WIDTH / size) / 2;
        panel(0, edge, 0, h);
        panel(1 - edge, 1, 0, h);
        panel(edge, 1 - edge, PROJECTION_DOOR_HEIGHT, h);
      } else {
        panel(0, 1, 0, h);
      }
    }
  }
  return {
    floor: new Float32Array(values.floor),
    wall: new Float32Array(values.wall),
    ceiling: new Float32Array(values.ceiling),
  };
}

function shader(gl: WebGL2RenderingContext, kind: number, source: string) {
  const compiled = gl.createShader(kind);
  if (!compiled) throw new Error('Unable to allocate a WebGL shader.');
  gl.shaderSource(compiled, source);
  gl.compileShader(compiled);
  if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
    const issue = gl.getShaderInfoLog(compiled);
    gl.deleteShader(compiled);
    throw new Error('3D shader compilation failed: ' + issue);
  }
  return compiled;
}

function programFor(gl: WebGL2RenderingContext) {
  const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate a WebGL program.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const issue = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('3D shader link failed: ' + issue);
  }
  return program;
}

interface Maze3DProjectionProps {
  maze: MazeState;
  facing: Direction;
  textureId: MazeTextureId;
}

/**
 * A read-only, first-person WebGL2 view of canonical MazeState. The existing
 * direction controls continue to dispatch through the original game commands.
 */
export function Maze3DProjection({ maze, facing, textureId }: Maze3DProjectionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cells = useMemo(() => projectMaze3D(maze, createMazeVisibilitySnapshot(maze)), [maze]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) {
      setError('WebGL2 is unavailable. Disable 3D preview in expedition settings to return to the 2D map.');
      return;
    }

    let alive = true;
    let program: WebGLProgram | undefined;
    const buffers: WebGLBuffer[] = [];
    const textures: WebGLTexture[] = [];
    const images: HTMLImageElement[] = [];
    let resizeObserver: ResizeObserver | undefined;
    try {
      program = programFor(gl);
      gl.useProgram(program);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      const scene = buildScene(cells);
      const position = gl.getAttribLocation(program, 'aPosition');
      const uv = gl.getAttribLocation(program, 'aUV');
      const eye = gl.getUniformLocation(program, 'uEye');
      const forward = gl.getUniformLocation(program, 'uForward');
      const aspect = gl.getUniformLocation(program, 'uAspect');
      const shade = gl.getUniformLocation(program, 'uShade');
      const texture = gl.getUniformLocation(program, 'uTexture');
      const groups: Array<{ kind: Surface; buffer: WebGLBuffer; texture: WebGLTexture; count: number }> = [];

      const render = () => {
        if (!alive) return;
        const bounds = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(bounds.width * ratio));
        const height = Math.max(1, Math.round(bounds.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clearColor(0.025, 0.037, 0.069, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const orientation = directions[facing];
        gl.uniform3f(eye, maze.active.column * PROJECTION_CELL_SIZE, 1.7, maze.active.row * PROJECTION_CELL_SIZE);
        gl.uniform2f(forward, orientation.x, orientation.z);
        gl.uniform1f(aspect, width / height);
        gl.uniform1i(texture, 0);
        gl.enableVertexAttribArray(position);
        gl.enableVertexAttribArray(uv);
        for (const group of groups) {
          gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
          gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
          gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, group.texture);
          gl.uniform1f(shade, group.kind === 'floor' ? 0.74 : group.kind === 'ceiling' ? 0.38 : 0.93);
          gl.drawArrays(gl.TRIANGLES, 0, group.count);
        }
      };

      for (const kind of surfaceOrder) {
        const buffer = gl.createBuffer();
        const tex = gl.createTexture();
        if (!buffer || !tex) throw new Error('Unable to allocate 3D scene buffers.');
        buffers.push(buffer);
        textures.push(tex);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, scene[kind], gl.STATIC_DRAW);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
          new Uint8Array([105, 112, 128, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        groups.push({ kind, buffer, texture: tex, count: scene[kind].length / 5 });
        const image = new Image();
        images.push(image);
        image.onload = () => {
          if (!alive) return;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          render();
        };
        image.src = kind === 'floor' ? floorSources[textureId] : textureSources[kind];
      }
      render();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(render);
        resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', render);
      }
      return () => {
        alive = false;
        resizeObserver?.disconnect();
        if (!resizeObserver) window.removeEventListener('resize', render);
        for (const image of images) image.onload = null;
        for (const buffer of buffers) gl.deleteBuffer(buffer);
        for (const tex of textures) gl.deleteTexture(tex);
        if (program) gl.deleteProgram(program);
      };
    } catch (cause) {
      alive = false;
      for (const image of images) image.onload = null;
      for (const buffer of buffers) gl.deleteBuffer(buffer);
      for (const tex of textures) gl.deleteTexture(tex);
      if (program) gl.deleteProgram(program);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [cells, facing, maze.active.column, maze.active.row, textureId]);

  return <>
    <canvas ref={canvasRef} className="maze-canvas" style={{ display: 'block', width: '100%', height: '100%' }} aria-label="3D dungeon projection" />
    {error && <div role="alert" style={{ position: 'absolute', inset: 'auto 10px 10px 10px', padding: 12, background: '#161a27' }}>{error}</div>}
  </>;
}
