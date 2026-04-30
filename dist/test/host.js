import { resolvePath } from "@typespec/compiler";
import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { createTester } from "@typespec/compiler/testing";
const baseTester = createTester(resolvePath(import.meta.dirname, "../.."), {
    libraries: ["@mlafleur/csharp-api-models", "@typespec/http", "@typespec/versioning"],
});
export const Tester = baseTester.emit("@mlafleur/csharp-api-models");
export async function emitWithDiagnostics(code, options) {
    const tester = options ? baseTester.emit("@mlafleur/csharp-api-models", options) : Tester;
    const [{ outputs }, diagnostics] = await tester.compileAndDiagnose(code);
    return [outputs, diagnostics];
}
export async function emit(code, options) {
    const [result, diagnostics] = await emitWithDiagnostics(code, options);
    expectDiagnosticEmpty(diagnostics);
    return result;
}
