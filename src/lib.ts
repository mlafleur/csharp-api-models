import { createTypeSpecLibrary, JSONSchemaType } from "@typespec/compiler";

export interface EmitterOptions {
  "root-namespace"?: string;
  "namespace-map"?: Record<string, string>;
  "models-output-dir"?: string;
  "interfaces-output-dir"?: string;
  "additional-usings"?: string[];
  "nullable-properties"?: boolean;
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
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@mlafleur/csharp-api-models",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
});

export const { reportDiagnostic, createDiagnostic } = $lib;
