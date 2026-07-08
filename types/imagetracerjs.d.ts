declare module 'imagetracerjs' {
  export interface TraceSegment {
    type: 'L' | 'Q';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3?: number;
    y3?: number;
  }

  export interface TracePath {
    segments: TraceSegment[];
    isholepath: boolean | number;
    holechildren: number[];
    boundingbox: number[];
  }

  export interface TraceData {
    layers: TracePath[][];
    palette: { r: number; g: number; b: number; a: number }[];
    width: number;
    height: number;
  }

  export interface TraceOptions {
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    colorsampling?: number;
    numberofcolors?: number;
    pal?: { r: number; g: number; b: number; a: number }[];
    blurradius?: number;
    linefilter?: boolean;
    rightangleenhance?: boolean;
  }

  interface ImageDataLike {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  const ImageTracer: {
    imagedataToTracedata(imgd: ImageDataLike, options?: TraceOptions): TraceData;
    imagedataToSVG(imgd: ImageDataLike, options?: TraceOptions): string;
  };

  export default ImageTracer;
}
