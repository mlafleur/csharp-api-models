import { resolvePath } from "@typespec/compiler";
import { createTestLibrary } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";
export const EmitterTestTestLibrary = createTestLibrary({
    name: "@mlafleur/csharp-api-models",
    packageRoot: resolvePath(fileURLToPath(import.meta.url), "../../../../"),
});
//# sourceMappingURL=index.js.map