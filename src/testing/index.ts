import { resolvePath } from "@typespec/compiler";
import { createTestLibrary, TypeSpecTestLibrary } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

export const EmitterTestTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "@mlafleur/csharp-api-models",
  packageRoot: resolvePath(fileURLToPath(import.meta.url), "../../../../"),
});
