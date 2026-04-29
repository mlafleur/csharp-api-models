import { createTypeSpecLibrary, JSONSchemaType, paramMessage } from "@typespec/compiler";

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

const EmitterOptionsSchema: JSONSchemaType<EmitterOptions> = {
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
    "models-output-dir": { type: "string", nullable: true },
    "interfaces-output-dir": { type: "string", nullable: true },
    "additional-usings": {
      type: "array",
      nullable: true,
      items: { type: "string" },
    },
    "nullable-properties": { type: "boolean", nullable: true },
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
      },
    },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@mlafleur/csharp-api-models",
  diagnostics: {
    "template-load-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Failed to load custom template "${"name"}" from "${"path"}": ${"reason"}`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
});

export const { reportDiagnostic, createDiagnostic } = $lib;
