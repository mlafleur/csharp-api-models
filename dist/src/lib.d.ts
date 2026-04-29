export interface TemplateOverrides {
    file?: string;
    class?: string;
    interface?: string;
    enum?: string;
}
export interface EmitterOptions {
    "root-namespace"?: string;
    "namespace-map"?: Record<string, string>;
    "models-output-dir"?: string;
    "interfaces-output-dir"?: string;
    "additional-usings"?: string[];
    "nullable-properties"?: boolean;
    templates?: TemplateOverrides;
}
export declare const $lib: import("@typespec/compiler").TypeSpecLibrary<{
    "template-load-failed": {
        readonly default: import("@typespec/compiler").CallableMessage<["name", "path", "reason"]>;
    };
}, EmitterOptions, never>;
export declare const reportDiagnostic: <C extends "template-load-failed", M extends keyof {
    "template-load-failed": {
        readonly default: import("@typespec/compiler").CallableMessage<["name", "path", "reason"]>;
    };
}[C]>(program: import("@typespec/compiler").Program, diag: import("@typespec/compiler").DiagnosticReport<{
    "template-load-failed": {
        readonly default: import("@typespec/compiler").CallableMessage<["name", "path", "reason"]>;
    };
}, C, M>) => void, createDiagnostic: <C extends "template-load-failed", M extends keyof {
    "template-load-failed": {
        readonly default: import("@typespec/compiler").CallableMessage<["name", "path", "reason"]>;
    };
}[C]>(diag: import("@typespec/compiler").DiagnosticReport<{
    "template-load-failed": {
        readonly default: import("@typespec/compiler").CallableMessage<["name", "path", "reason"]>;
    };
}, C, M>) => import("@typespec/compiler").Diagnostic;
