/**
 * @module lib
 *
 * Defines the public emitter-options contract, the JSON Schema used by the
 * TypeSpec compiler to validate those options, and the shared diagnostic
 * library instance.
 */
/**
 * Paths to custom Handlebars templates that replace the built-in defaults.
 * Only the templates listed here can be overridden; all keys are optional.
 */
export interface TemplateOverrides {
    /** Custom template for the file wrapper (namespace + usings). */
    file?: string;
    /** Custom template for C# class declarations. */
    class?: string;
    /** Custom template for C# interface declarations. */
    interface?: string;
    /** Custom template for C# enum declarations. */
    enum?: string;
    /** Custom template for ASP.NET Core abstract controller classes. */
    controller?: string;
    /** Custom template for service interface declarations. */
    "service-interface"?: string;
    /** Custom template for the MergePatchValue helper class. */
    "merge-patch-value"?: string;
    /** Custom template for the EnumMemberConverter helper class. */
    "enum-member-converter"?: string;
}
/**
 * All configuration options accepted by the emitter in `tspconfig.yaml` under
 * the `options["@mlafleur/csharp-api-models"]` key.
 */
export interface EmitterOptions {
    /**
     * Root C# namespace.  When set, this prefix is stripped from generated
     * folder paths so that `RootNs.Sub.Model` is placed under `Sub/Model.g.cs`
     * rather than `RootNs/Sub/Model.g.cs`.
     */
    "root-namespace"?: string;
    /**
     * Rewrites TypeSpec namespace names to different C# namespaces.
     * The longest matching key wins when multiple entries could apply.
     *
     * @example `{ "Legacy.Common": "Acme.Common" }`
     */
    "namespace-map"?: Record<string, string>;
    /**
     * File extension for all emitted C# files.
     * Defaults to `.g.cs` (the conventional suffix for generated code).
     */
    "file-extension"?: string;
    /**
     * Output directory for generated model classes and enums.
     * Relative paths are resolved against the emitter output dir.
     */
    "models-output-dir"?: string;
    /**
     * Output directory for generated model interfaces (`I<Model>`).
     * Relative paths are resolved against the emitter output dir.
     */
    "interfaces-output-dir"?: string;
    /**
     * Output directory for generated controller base classes.
     * Defaults to `Controllers/` inside the emitter output dir.
     */
    "controllers-output-dir"?: string;
    /**
     * Output directory for generated service interfaces and abstract classes.
     * Defaults to `Services/` inside the emitter output dir.
     */
    "services-output-dir"?: string;
    /**
     * Output directory for generated helper classes (e.g. `MergePatchValue`).
     * Defaults to `Helpers/` inside the emitter output dir.
     */
    "helpers-output-dir"?: string;
    /**
     * Route prefix prepended to every controller route attribute.
     * Defaults to `"api"`.
     * @example `"api/v2"` → `[HttpGet("/api/v2/widgets")]`
     */
    "route-prefix"?: string;
    /**
     * When `true` (the default), the C# namespace for controllers, services,
     * and helpers is derived from their output folder path rather than from
     * the TypeSpec namespace.
     *
     * When enabled (the default), all generated files — models, interfaces,
     * enums, controllers, services, and helpers — derive their C# namespace
     * from the `root-namespace` option combined with their output directory
     * path.  For example, with `root-namespace: "MyApp"`:
     *
     * - `controllers-output-dir: "Controllers"` → `namespace MyApp.Controllers`
     * - `models-output-dir: "Models"` → `namespace MyApp.Models`
     * - `helpers-output-dir: "Helpers"` → `namespace MyApp.Helpers`
     *
     * When disabled (`false`), models, interfaces, and enums use the TypeSpec
     * namespace, and controllers/services use the TypeSpec namespace of their
     * operation container.
     */
    "namespace-from-path"?: boolean;
    /**
     * Extra `using` directives appended to every emitted file.
     * @example `["System.Text.Json.Serialization"]`
     */
    "additional-usings"?: string[];
    /**
     * When `true` (the default), every property is emitted as a nullable type
     * regardless of whether it is marked optional in TypeSpec.
     * Set to `false` to emit non-optional properties as non-nullable.
     */
    "nullable-properties"?: boolean;
    /**
     * Suffix appended to generated abstract class names.
     * Defaults to `"Base"`, producing e.g. `UsersControllerBase`.
     */
    "abstract-suffix"?: string;
    /** Custom Handlebars template paths keyed by template name. */
    templates?: TemplateOverrides;
}
/**
 * Shared TypeSpec library instance.  Registers the emitter's diagnostic codes
 * and option schema with the compiler toolchain.
 */
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
