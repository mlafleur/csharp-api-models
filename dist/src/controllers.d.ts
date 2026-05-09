/**
 * @module controllers
 *
 * Collects HTTP service operations from a compiled TypeSpec program and
 * organises them into {@link ControllerGroup} records, each of which describes
 * one controller / service pair ready for template rendering.
 *
 * The main export is {@link collectControllers}, called by the emitter after
 * all models and enums have been processed.
 */
import { Namespace, Program } from "@typespec/compiler";
import { ControllerView, ServiceView } from "./renderer.js";
/**
 * Options forwarded from the emitter to the controller collection phase.
 * These mirror the subset of {@link ResolvedOptions} that affects routing and
 * naming.
 */
export interface ControllerOptions {
    /** Route prefix prepended to every generated route string. */
    routePrefix: string;
    /** When `true`, all properties are treated as nullable C# types. */
    nullableProperties: boolean;
    /** Suffix appended to generated abstract class names, e.g. `"Base"`. */
    abstractSuffix: string;
}
/**
 * A self-contained bundle of everything the emitter needs to write one
 * controller file and its companion service-interface file.
 */
export interface ControllerGroup {
    /** View model for the abstract ASP.NET Core controller class. */
    controllerView: ControllerView;
    /** View model for the service interface. */
    serviceView: ServiceView;
    /** Resolved C# namespace for the generated files. */
    namespace: string;
    /** Folder path segments derived from the namespace under the output root. */
    folder: string[];
    /** Original TypeSpec container name (Interface or Namespace name). */
    containerName: string;
}
/**
 * Walks all HTTP services in the compiled TypeSpec program and returns one
 * {@link ControllerGroup} per logical operation container (TypeSpec Interface
 * or Namespace).
 *
 * @param program - The compiled TypeSpec program.
 * @param options - Routing and naming options forwarded from the emitter.
 * @param resolveNamespace - Callback that converts a TypeSpec Namespace node to
 *   a C# namespace string.
 * @param toFolderSegments - Callback that converts a C# namespace string to the
 *   relative folder path segments used when writing files.
 * @returns Array of controller groups, empty if any HTTP diagnostic errors are
 *   present in the program.
 */
export declare function collectControllers(program: Program, options: ControllerOptions, resolveNamespace: (ns: Namespace | undefined) => string, toFolderSegments: (ns: string) => string[]): ControllerGroup[];
