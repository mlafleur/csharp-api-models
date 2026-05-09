/**
 * @module lib
 *
 * Defines the public emitter-options contract, the JSON Schema used by the
 * TypeSpec compiler to validate those options, and the shared diagnostic
 * library instance.
 */
import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";
/** JSON Schema used by the TypeSpec compiler to validate emitter options. */
const EmitterOptionsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        "root-namespace": { type: "string", nullable: true },
        "namespace-map": {
            type: "object",
            nullable: true,
            required: [],
            additionalProperties: { type: "string" },
        },
        "file-extension": { type: "string", nullable: true },
        "models-output-dir": { type: "string", nullable: true },
        "interfaces-output-dir": { type: "string", nullable: true },
        "controllers-output-dir": { type: "string", nullable: true },
        "services-output-dir": { type: "string", nullable: true },
        "helpers-output-dir": { type: "string", nullable: true },
        "route-prefix": { type: "string", nullable: true },
        "namespace-from-path": { type: "boolean", nullable: true },
        "additional-usings": {
            type: "array",
            nullable: true,
            items: { type: "string" },
        },
        "nullable-properties": { type: "boolean", nullable: true },
        "abstract-suffix": { type: "string", nullable: true },
        templates: {
            type: "object",
            nullable: true,
            additionalProperties: false,
            required: [],
            properties: {
                file: { type: "string", nullable: true },
                class: { type: "string", nullable: true },
                interface: { type: "string", nullable: true },
                enum: { type: "string", nullable: true },
                controller: { type: "string", nullable: true },
                "service-interface": { type: "string", nullable: true },
                "merge-patch-value": { type: "string", nullable: true },
                "enum-member-converter": { type: "string", nullable: true },
            },
        },
    },
    required: [],
};
/**
 * Shared TypeSpec library instance.  Registers the emitter's diagnostic codes
 * and option schema with the compiler toolchain.
 */
export const $lib = createTypeSpecLibrary({
    name: "@mlafleur/csharp-api-models",
    diagnostics: {
        "template-load-failed": {
            severity: "error",
            messages: {
                default: paramMessage `Failed to load custom template "${"name"}" from "${"path"}": ${"reason"}`,
            },
        },
    },
    emitter: {
        options: EmitterOptionsSchema,
    },
});
export const { reportDiagnostic, createDiagnostic } = $lib;
//# sourceMappingURL=lib.js.map