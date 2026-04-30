import { Namespace, Program } from "@typespec/compiler";
import { ControllerView, ServiceView } from "./renderer.js";
export interface ControllerOptions {
    routePrefix: string;
    nullableProperties: boolean;
    abstractSuffix: string;
}
export interface ControllerGroup {
    controllerView: ControllerView;
    serviceView: ServiceView;
    namespace: string;
    folder: string[];
    containerName: string;
}
export declare function collectControllers(program: Program, options: ControllerOptions, resolveNamespace: (ns: Namespace | undefined) => string, toFolderSegments: (ns: string) => string[]): ControllerGroup[];
