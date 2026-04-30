import {
  Interface,
  ModelProperty,
  Namespace,
  Program,
  Type,
  getDoc,
  getFormat,
  isArrayModelType,
  isRecordModelType,
} from "@typespec/compiler";
import {
  HttpOperation,
  HttpOperationParameter,
  HttpPayloadBody,
  getAllHttpServices,
  getRoutePath,
} from "@typespec/http";
import { getAllVersions } from "@typespec/versioning";
import {
  ControllerView,
  OperationParamView,
  OperationView,
  ServiceView,
  renderDocComment,
} from "./renderer.js";

const FORMAT_MAP: Record<string, string> = {
  uuid: "Guid",
  guid: "Guid",
  uri: "Uri",
  url: "Uri",
  "date-time": "DateTimeOffset",
  date: "DateOnly",
  time: "TimeOnly",
};

const SCALAR_MAP: Record<string, string> = {
  string: "string",
  boolean: "bool",
  bytes: "byte[]",
  int8: "sbyte",
  int16: "short",
  int32: "int",
  int64: "long",
  uint8: "byte",
  uint16: "ushort",
  uint32: "uint",
  uint64: "ulong",
  safeint: "long",
  integer: "long",
  float: "double",
  float32: "float",
  float64: "double",
  decimal: "decimal",
  decimal128: "decimal",
  numeric: "double",
  plainDate: "DateOnly",
  plainTime: "TimeOnly",
  utcDateTime: "DateTimeOffset",
  offsetDateTime: "DateTimeOffset",
  duration: "TimeSpan",
  url: "Uri",
};

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

type OperationContainer = Interface | Namespace;

export function collectControllers(
  program: Program,
  options: ControllerOptions,
  resolveNamespace: (ns: Namespace | undefined) => string,
  toFolderSegments: (ns: string) => string[],
): ControllerGroup[] {
  const [services, diagnostics] = getAllHttpServices(program);
  if (diagnostics.length > 0) return [];

  const groups: ControllerGroup[] = [];

  for (const service of services) {
    const versions = getAllVersions(program, service.namespace) ?? [];
    const versionValues = versions.map((v) => v.value);

    const byContainer = new Map<OperationContainer, HttpOperation[]>();
    for (const op of service.operations) {
      const container = op.container as OperationContainer;
      if (!byContainer.has(container)) byContainer.set(container, []);
      byContainer.get(container)!.push(op);
    }

    for (const [container, ops] of byContainer) {
      const containerName = container.name;
      if (!containerName) continue;

      const ns = resolveNamespace(
        container.kind === "Interface" ? container.namespace : container,
      );
      const folder = toFolderSegments(ns);
      const doc = getDoc(program, container);

      const controllerName = `${pascalCase(containerName)}Controller${options.abstractSuffix}`;
      const serviceName = `${pascalCase(containerName)}Service${options.abstractSuffix}`;
      const serviceInterfaceName = `I${pascalCase(containerName)}Service`;

      const basePath = resolveControllerPath(program, ops);
      const routes = buildRoutes(options.routePrefix, basePath, versionValues);
      const operations = ops.map((op) => buildOperationView(program, op, options));

      groups.push({
        controllerView: {
          doc: doc ? renderDocComment(doc) : undefined,
          controllerName,
          serviceName,
          serviceInterfaceName,
          routes,
          operations,
        },
        serviceView: {
          doc: doc ? renderDocComment(doc) : undefined,
          serviceName,
          interfaceName: serviceInterfaceName,
          operations,
        },
        namespace: ns,
        folder,
        containerName,
      });
    }
  }

  return groups;
}

function resolveControllerPath(program: Program, ops: HttpOperation[]): string {
  if (ops.length === 0) return "";
  const firstOp = ops[0];
  const opRoute = getRoutePath(program, firstOp.operation)?.path;
  if (opRoute && opRoute !== "/") {
    const suffix = opRoute.startsWith("/") ? opRoute : `/${opRoute}`;
    const fullPath = firstOp.path;
    if (fullPath.endsWith(suffix)) {
      return fullPath.slice(0, fullPath.length - suffix.length) || "/";
    }
  }
  return firstOp.path;
}

function buildRoutes(prefix: string, basePath: string, versions: string[]): string[] {
  const trimmedBase = basePath.replace(/^\//, "");
  const trimmedPrefix = prefix.replace(/^\/|\/$/g, "");

  if (versions.length === 0) {
    const parts = [trimmedPrefix, trimmedBase].filter(Boolean);
    return ["/" + parts.join("/")];
  }

  return versions.map((v) => {
    const parts = [trimmedPrefix, v, trimmedBase].filter(Boolean);
    return "/" + parts.join("/");
  });
}

function buildOperationView(
  program: Program,
  op: HttpOperation,
  options: ControllerOptions,
): OperationView {
  const opRoute = getRoutePath(program, op.operation)?.path;
  const routeSuffix =
    opRoute && opRoute !== "/" ? opRoute.replace(/^\//, "") : undefined;

  const doc = getDoc(program, op.operation);
  const params = buildParams(program, op.parameters.parameters, op.parameters.body, options);
  const returnType = resolveReturnType(program, op, options);

  return {
    doc: doc ? renderDocComment(doc) : undefined,
    name: pascalCase(op.operation.name),
    httpVerb: pascalCase(op.verb),
    routeSuffix,
    params,
    returnType,
  };
}

function buildParams(
  program: Program,
  parameters: HttpOperationParameter[],
  body: HttpPayloadBody | undefined,
  options: ControllerOptions,
): OperationParamView[] {
  const result: OperationParamView[] = [];

  for (const param of parameters) {
    const binding = httpParamBinding(param.type);
    if (!binding) continue;
    const prop = param.param;
    result.push({
      name: camelCase(prop.name),
      type: propTypeRef(program, prop, options),
      binding,
      optional: prop.optional,
    });
  }

  if (body && body.bodyKind === "single") {
    result.push({
      name: "body",
      type: typeRef(program, body.type, options),
      binding: "FromBody",
      optional: false,
    });
  }

  return result;
}

function httpParamBinding(
  location: HttpOperationParameter["type"],
): OperationParamView["binding"] | undefined {
  switch (location) {
    case "path":
      return "FromRoute";
    case "query":
      return "FromQuery";
    case "header":
      return "FromHeader";
    default:
      return undefined;
  }
}

function resolveReturnType(program: Program, op: HttpOperation, options: ControllerOptions): string {
  for (const response of op.responses) {
    const code = response.statusCodes;
    const is2xx =
      code === "*" ||
      (typeof code === "number" && code >= 200 && code < 300) ||
      (typeof code === "object" && code.start >= 200 && code.end < 300);
    if (!is2xx) continue;

    for (const content of response.responses) {
      if (content.body?.bodyKind === "single") {
        return typeRef(program, content.body.type, options);
      }
    }
  }
  return "object";
}

function propTypeRef(program: Program, prop: ModelProperty, options: ControllerOptions): string {
  const propFormat = getFormat(program, prop);
  const scalarFormat = prop.type.kind === "Scalar" ? getFormat(program, prop.type) : undefined;
  const format = propFormat ?? scalarFormat;
  if (format && FORMAT_MAP[format.toLowerCase()]) {
    return FORMAT_MAP[format.toLowerCase()];
  }
  return typeRef(program, prop.type, options);
}

function typeRef(program: Program, type: Type, options: ControllerOptions): string {
  switch (type.kind) {
    case "Scalar": {
      const format = getFormat(program, type);
      if (format && FORMAT_MAP[format.toLowerCase()]) return FORMAT_MAP[format.toLowerCase()];
      const mapped = SCALAR_MAP[type.name];
      if (mapped) return mapped;
      let parent = type.baseScalar;
      while (parent) {
        const m = SCALAR_MAP[parent.name];
        if (m) return m;
        parent = parent.baseScalar;
      }
      return "object";
    }
    case "Model": {
      if (isArrayModelType(type)) {
        return `IList<${typeRef(program, type.indexer.value, options)}>`;
      }
      if (isRecordModelType(type)) {
        return `IDictionary<string, ${typeRef(program, type.indexer.value, options)}>`;
      }
      return pascalCase(type.name || "object");
    }
    case "Enum":
      return pascalCase(type.name);
    case "Boolean":
      return "bool";
    case "String":
      return "string";
    case "Number":
      return "double";
    case "Union": {
      const variants = [...type.variants.values()];
      const nonNull = variants.filter(
        (v) => !(v.type.kind === "Intrinsic" && v.type.name === "null"),
      );
      if (nonNull.length === 1) return typeRef(program, nonNull[0].type, options);
      return "object";
    }
    default:
      return "object";
  }
}

function pascalCase(name: string): string {
  if (!name) return name;
  return name
    .split(/[_\-\s]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join("");
}

function camelCase(name: string): string {
  const pascal = pascalCase(name);
  return pascal ? pascal[0].toLowerCase() + pascal.slice(1) : pascal;
}
