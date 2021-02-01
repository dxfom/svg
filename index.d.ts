import { DxfReadonly } from '@dxfom/dxf';

export declare const calculateViewBox: ({ ENTITIES }: DxfReadonly) => {
	x: number;
	y: number;
	w: number;
	h: number;
};
export interface CreateSvgContentStringOptions {
	readonly warn: (message: string, ...args: any[]) => void;
	readonly resolveColorIndex: (colorIndex: number) => string;
	readonly encoding?: string | TextDecoder;
}
export declare const createSvgContentsString: (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions> | undefined) => string;
export declare const createSvgString: (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions> | undefined) => string;

export {};
