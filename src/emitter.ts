import {
  EmitContext,
  Enum,
  Model,
  ModelProperty,
  Namespace,
  Program,
  Type,
  emitFile,
  getDoc,
  getFormat,
  getNamespaceFullName,
  isArrayModelType,
  isRecordModelType,
  isStdNamespace,
  isTemplateDeclaration,
  navigateProgram,
  NoTarget,
  resolvePath,
} from "@typespec/compiler";
import { EmitterOptions, reportDiagnostic } from "./lib.js";
import {
  ClassView,
  EnumView,
  InterfaceView,
  PropertyView,
  Renderer,
  TemplateName,
  TemplateOverrides,
  createRenderer,
  renderDocComment,
} from "./renderer.js";
import { ControllerGroup, ControllerOptions, collectControllers } from "./controllers.js";

const DEFAULT_NAMESPACE = "Models";
const SYSTEM_USINGS = ["System", "System.Collections.Generic"];
const CONTROLLER_USINGS = [
  "System",
  "System.Collections.Generic",
  "System.Threading.Tasks",
  "Microsoft.AspNetCore.Mvc",
];

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

const FORMAT_MAP: Record<string, string> = {
  uuid: "Guid",
  guid: "Guid",
  uri: "Uri",
  url: "Uri",
  "date-time": "DateTimeOffset",
  date: "DateOnly",
  time: "TimeOnly",
};

interface ResolvedOptions {
  rootNamespace: string | undefined;
  namespaceMap: Array<{ key: string; value: string }>;
  modelsOutputDir: string;
  interfacesOutputDir: string;
  controllersOutputDir: string;
  servicesOutputDir: string;
  routePrefix: string;
  additionalUsings: string[];
  nullableProperties: boolean;
  abstractSuffix: string;
  templates: TemplateOverrides;
}

export async function $onEmit(context: EmitContext<EmitterOptions>): Promise<void> {
  if (context.program.compilerOptions.noEmit) {
    return;
  }

  const program = context.program;
  const options = resolveOptions(context);

  const renderer = buildRenderer(program, options);
  if (!renderer) return;

  // ── Models & enums ──────────────────────────────────────────────────────────
  const models: Model[] = [];
  const enums: Enum[] = [];

  navigateProgram(program, {
    model(model) {
      if (shouldEmitModel(model)) models.push(model);
    },
    enum(en) {
      if (shouldEmitEnum(en)) enums.push(en);
    },
  });

  for (const model of models) {
    const ns = csharpNamespaceFor(model.namespace, options);
    const folder = folderSegments(options.rootNamespace, ns);
    const usings = collectUsings(ns, modelReferences(model), options);

    await emitFile(program, {
      path: resolvePath(options.modelsOutputDir, ...folder, `${pascalCase(model.name)}.cs`),
      content: renderer.renderFile({
        namespace: ns,
        usings,
        body: renderer.renderClass(buildClassView(program, model, options)),
      }),
    });

    await emitFile(program, {
      path: resolvePath(options.interfacesOutputDir, ...folder, `I${pascalCase(model.name)}.cs`),
      content: renderer.renderFile({
        namespace: ns,
        usings,
        body: renderer.renderInterface(buildInterfaceView(program, model, options)),
      }),
    });
  }

  for (const en of enums) {
    const ns = csharpNamespaceFor(en.namespace, options);
    const folder = folderSegments(options.rootNamespace, ns);
    await emitFile(program, {
      path: resolvePath(options.modelsOutputDir, ...folder, `${pascalCase(en.name)}.cs`),
      content: renderer.renderFile({
        namespace: ns,
        usings: collectUsings(ns, [], options),
        body: renderer.renderEnum(buildEnumView(en)),
      }),
    });
  }

  // ── Controllers & services ──────────────────────────────────────────────────
  const controllerOptions: ControllerOptions = {
    routePrefix: options.routePrefix,
    nullableProperties: options.nullableProperties,
    abstractSuffix: options.abstractSuffix,
  };

  const groups = collectControllers(
    program,
    controllerOptions,
    (ns) => csharpNamespaceFor(ns, options),
    (ns) => folderSegments(options.rootNamespace, ns),
  );

  for (const group of groups) {
    await emitControllerGroup(program, group, renderer, options);
  }
}

async function emitControllerGroup(
  program: Program,
  group: ControllerGroup,
  renderer: Renderer,
  options: ResolvedOptions,
): Promise<void> {
  const { controllerView, serviceView, namespace, folder } = group;
  const usings = sortUsings(new Set(CONTROLLER_USINGS));

  await emitFile(program, {
    path: resolvePath(
      options.controllersOutputDir,
      ...folder,
      `${controllerView.controllerName}.cs`,
    ),
    content: renderer.renderFile({
      namespace,
      usings,
      body: renderer.renderController(controllerView),
    }),
  });

  await emitFile(program, {
    path: resolvePath(
      options.servicesOutputDir,
      ...folder,
      `${serviceView.interfaceName}.cs`,
    ),
    content: renderer.renderFile({
      namespace,
      usings: sortUsings(new Set(["System", "System.Collections.Generic", "System.Threading.Tasks"])),
      body: renderer.renderServiceInterface(serviceView),
    }),
  });

}

function sortUsings(set: Set<string>): string[] {
  return [...set].sort((a, b) => {
    const aSystem = a === "System" || a.startsWith("System.");
    const bSystem = b === "System" || b.startsWith("System.");
    if (aSystem !== bSystem) return aSystem ? -1 : 1;
    return a.localeCompare(b);
  });
}

function buildRenderer(
  program: Program,
  options: ResolvedOptions,
): Renderer | undefined {
  try {
    return createRenderer(options.templates);
  } catch (err) {
    const path = findFailingTemplatePath(options.templates, err);
    const name = (Object.entries(options.templates).find(([, p]) => p === path)?.[0] ??
      "unknown") as TemplateName;
    reportDiagnostic(program, {
      code: "template-load-failed",
      target: NoTarget,
      format: {
        name,
        path: path ?? "",
        reason: err instanceof Error ? err.message : String(err),
      },
    });
    return undefined;
  }
}

function findFailingTemplatePath(
  templates: TemplateOverrides,
  err: unknown,
): string | undefined {
  const message = err instanceof Error ? err.message : String(err);
  for (const value of Object.values(templates)) {
    if (value && message.includes(value)) return value;
  }
  return undefined;
}

function resolveOptions(context: EmitContext<EmitterOptions>): ResolvedOptions {
  const raw = context.options;
  const baseDir = context.emitterOutputDir;
  const map = raw["namespace-map"] ?? {};
  const namespaceMap = Object.entries(map)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.key.length - a.key.length);
  return {
    rootNamespace: raw["root-namespace"],
    namespaceMap,
    modelsOutputDir: raw["models-output-dir"]
      ? resolvePath(baseDir, raw["models-output-dir"])
      : baseDir,
    interfacesOutputDir: raw["interfaces-output-dir"]
      ? resolvePath(baseDir, raw["interfaces-output-dir"])
      : baseDir,
    controllersOutputDir: resolvePath(baseDir, raw["controllers-output-dir"] ?? "Controllers"),
    servicesOutputDir: resolvePath(baseDir, raw["services-output-dir"] ?? "Services"),
    routePrefix: raw["route-prefix"] ?? "",
    additionalUsings: raw["additional-usings"] ?? [],
    nullableProperties: raw["nullable-properties"] ?? true,
    abstractSuffix: raw["abstract-suffix"] ?? "Base",
    templates: resolveTemplatePaths(raw.templates),
  };
}

function resolveTemplatePaths(templates: EmitterOptions["templates"]): TemplateOverrides {
  if (!templates) return {};
  const out: TemplateOverrides = {};
  const keys: (keyof TemplateOverrides)[] = [
    "file",
    "class",
    "interface",
    "enum",
    "controller",
    "service-interface",
  ];
  for (const name of keys) {
    const value = templates[name as keyof typeof templates];
    if (value) out[name] = resolvePath(process.cwd(), value);
  }
  return out;
}

function shouldEmitModel(model: Model): boolean {
  if (!model.name) return false;
  if (isInStdNamespace(model.namespace)) return false;
  if (isArrayModelType(model)) return false;
  if (isRecordModelType(model)) return false;
  if (isTemplateDeclaration(model)) return false;
  return true;
}

function shouldEmitEnum(en: Enum): boolean {
  if (!en.name) return false;
  if (isInStdNamespace(en.namespace)) return false;
  return true;
}

function isInStdNamespace(ns: Namespace | undefined): boolean {
  let current: Namespace | undefined = ns;
  while (current) {
    if (isStdNamespace(current)) return true;
    current = current.namespace;
  }
  return false;
}

function namespaceFullName(ns: Namespace | undefined): string {
  if (!ns) return "";
  return getNamespaceFullName(ns) || "";
}

function csharpNamespaceFor(ns: Namespace | undefined, options: ResolvedOptions): string {
  const fullNs = namespaceFullName(ns);
  if (!fullNs) return options.rootNamespace ?? DEFAULT_NAMESPACE;
  const mapped = applyNamespaceMap(fullNs, options.namespaceMap);
  return mapped.split(".").map(pascalCase).join(".");
}

function applyNamespaceMap(
  fullNs: string,
  map: Array<{ key: string; value: string }>,
): string {
  for (const { key, value } of map) {
    if (fullNs === key) return value;
    if (fullNs.startsWith(key + ".")) return value + fullNs.slice(key.length);
  }
  return fullNs;
}

function folderSegments(rootNs: string | undefined, csharpNs: string): string[] {
  if (!rootNs) return [];
  if (csharpNs === rootNs) return [];
  if (csharpNs.startsWith(rootNs + ".")) {
    return csharpNs.slice(rootNs.length + 1).split(".");
  }
  return [];
}

function modelReferences(model: Model): Type[] {
  const refs: Type[] = [];
  if (model.baseModel) refs.push(model.baseModel);
  for (const prop of model.properties.values()) {
    refs.push(prop.type);
  }
  return refs;
}

function* collectReferencedTypes(type: Type): Generator<Model | Enum> {
  switch (type.kind) {
    case "Model":
      if (isArrayModelType(type) || isRecordModelType(type)) {
        yield* collectReferencedTypes(type.indexer.value);
      } else if (type.name) {
        yield type;
      }
      break;
    case "Enum":
      yield type;
      break;
    case "Union":
      for (const variant of type.variants.values()) {
        yield* collectReferencedTypes(variant.type);
      }
      break;
  }
}

function collectUsings(
  ownNamespace: string,
  references: Type[],
  options: ResolvedOptions,
): string[] {
  const usings = new Set<string>(SYSTEM_USINGS);
  for (const u of options.additionalUsings) usings.add(u);
  for (const ref of references) {
    for (const type of collectReferencedTypes(ref)) {
      const ns = csharpNamespaceFor(type.namespace, options);
      if (ns && ns !== ownNamespace) usings.add(ns);
    }
  }
  return sortUsings(usings);
}

function buildClassView(
  program: Program,
  model: Model,
  options: ResolvedOptions,
): ClassView {
  const className = pascalCase(model.name);
  return {
    doc: docFor(program, model),
    className,
    interfaceName: `I${className}`,
    baseClass: model.baseModel ? typeReference(model.baseModel) : undefined,
    properties: buildPropertyViews(program, model, options),
  };
}

function buildInterfaceView(
  program: Program,
  model: Model,
  options: ResolvedOptions,
): InterfaceView {
  return {
    doc: docFor(program, model),
    interfaceName: `I${pascalCase(model.name)}`,
    baseInterface: model.baseModel ? `I${pascalCase(model.baseModel.name)}` : undefined,
    properties: buildPropertyViews(program, model, options),
  };
}

function buildEnumView(en: Enum): EnumView {
  return {
    enumName: pascalCase(en.name),
    members: [...en.members.values()].map((member) => ({
      name: pascalCase(member.name),
      value: typeof member.value === "number" ? member.value : undefined,
    })),
  };
}

function buildPropertyViews(
  program: Program,
  model: Model,
  options: ResolvedOptions,
): PropertyView[] {
  return [...model.properties.values()].map((prop) => ({
    doc: docFor(program, prop),
    type: propertyTypeName(program, prop, options),
    name: pascalCase(prop.name),
  }));
}

function docFor(program: Program, target: Model | ModelProperty): string | undefined {
  const doc = getDoc(program, target);
  return doc ? renderDocComment(doc) : undefined;
}

function propertyTypeName(
  program: Program,
  prop: ModelProperty,
  options: ResolvedOptions,
): string {
  const propFormat = getFormat(program, prop);
  const scalarFormat =
    prop.type.kind === "Scalar" ? getFormat(program, prop.type) : undefined;
  const format = propFormat ?? scalarFormat;
  let type: string;
  if (format && FORMAT_MAP[format.toLowerCase()]) {
    type = FORMAT_MAP[format.toLowerCase()];
  } else {
    type = typeReference(prop.type);
  }
  const nullable = prop.optional || options.nullableProperties;
  return nullable && !type.endsWith("?") ? `${type}?` : type;
}

function typeReference(type: Type): string {
  switch (type.kind) {
    case "Scalar": {
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
        return `IList<${typeReference(type.indexer.value)}>`;
      }
      if (isRecordModelType(type)) {
        return `IDictionary<string, ${typeReference(type.indexer.value)}>`;
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
      const hasNull = nonNull.length !== variants.length;
      if (nonNull.length === 1) {
        const ref = typeReference(nonNull[0].type);
        return hasNull ? `${ref}?` : ref;
      }
      return "object";
    }
    case "Intrinsic":
      if (type.name === "null") return "object?";
      return "object";
    case "Tuple":
      return "object";
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
