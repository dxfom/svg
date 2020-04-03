import { DxfReadonly } from '@dxfom/dxf';

export interface CreateSvgStringOptions {
	readonly warn: (message: string, ...args: any[]) => void;
	readonly resolveColorIndex: (colorIndex: number) => string;
}
export declare const createSvgString: (dxf: DxfReadonly, options?: Partial<CreateSvgStringOptions> | undefined) => string;

export {};
