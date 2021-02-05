import { DxfReadonly } from '@dxfom/dxf';

export interface CreateSvgContentStringOptions {
	readonly warn: (message: string, ...args: any[]) => void;
	readonly resolveColorIndex: (colorIndex: number) => string;
	readonly encoding?: string | TextDecoder;
}
export declare const createSvgContents: (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions> | undefined) => readonly [
	string,
	{
		readonly x: number;
		readonly y: number;
		readonly w: number;
		readonly h: number;
	}
];
export declare const createSvgString: (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions> | undefined) => string;

export {};
