import { DxfReadonly, DxfRecordReadonly } from '@dxfom/dxf';

export interface DxfFont {
	readonly family: string;
	readonly weight?: number;
	readonly style?: "italic";
	readonly scale?: number;
}
export interface MTEXT_contentsOptions {
	readonly resolveFont?: (font: DxfFont) => Partial<DxfFont>;
}
export interface CreateSvgContentStringOptions extends MTEXT_contentsOptions {
	readonly warn: (message: string, ...args: any[]) => void;
	readonly resolveColorIndex: (colorIndex: number) => string;
	readonly resolveLineWeight: (lineWeight: number) => number;
	readonly encoding?: string | TextDecoder;
	readonly addAttributes?: (entity: DxfRecordReadonly) => Record<string, string | number | boolean | undefined>;
}
export declare const createSvgContents: (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions>) => readonly [
	string,
	{
		readonly x: number;
		readonly y: number;
		readonly w: number;
		readonly h: number;
	}
];
export declare const createSvgString: (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions>) => string;

export {};
