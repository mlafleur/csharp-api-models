/**
 * @module emitter
 *
 * Core TypeSpec emitter.  The exported {@link $onEmit} function is called by
 * the TypeSpec compiler for every `emit` run and is responsible for:
 *
 * 1. Resolving all user-supplied options.
 * 2. Collecting models, enums, and HTTP service operations from the compiled
 *    program.
 * 3. Rendering each artifact through Handlebars templates.
 * 4. Writing the resulting `.g.cs` (or custom-extension) files to disk via the
 *    TypeSpec `emitFile` API.
 */
import { EmitContext } from "@typespec/compiler";
import { EmitterOptions } from "./lib.js";
/**
 * TypeSpec emitter entry point.  Called once per emit run by the TypeSpec
 * compiler.
 *
 * Emits:
 * - One `<Model>.g.cs` and `I<Model>.g.cs` per TypeSpec model.
 * - One `<Name>.g.cs` per TypeSpec enum.
 * - One controller file and one service-interface file per HTTP operation
 *   container.
 *
 * @param context - Emit context provided by the TypeSpec compiler, carrying the
 *   compiled program, resolved options, and output directory path.
 */
export declare function $onEmit(context: EmitContext<EmitterOptions>): Promise<void>;
