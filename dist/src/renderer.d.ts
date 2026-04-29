export type TemplateName = "file" | "class" | "interface" | "enum";
export type TemplateOverrides = Partial<Record<TemplateName, string>>;
export interface PropertyView {
    doc?: string;
    type: string;
    name: string;
}
export interface ClassView {
    doc?: string;
    className: string;
    interfaceName: string;
    baseClass?: string;
    properties: PropertyView[];
}
export interface InterfaceView {
    doc?: string;
    interfaceName: string;
    baseInterface?: string;
    properties: PropertyView[];
}
export interface EnumMemberView {
    name: string;
    value?: number;
}
export interface EnumView {
    enumName: string;
    members: EnumMemberView[];
}
export interface FileView {
    namespace: string;
    usings: string[];
    body: string;
}
export interface Renderer {
    renderFile(view: FileView): string;
    renderClass(view: ClassView): string;
    renderInterface(view: InterfaceView): string;
    renderEnum(view: EnumView): string;
}
export declare function renderDocComment(doc: string): string;
export declare function createRenderer(overrides?: TemplateOverrides): Renderer;
