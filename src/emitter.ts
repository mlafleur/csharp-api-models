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
  resolvePath,
} from "@typespec/compiler";
import { EmitterOptions } from "./lib.js";

const DEFAULT_NAMESPACE = "Models";
const SYSTEM_USINGS = ["System", "System.Collections.Generic"];

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
  additionalUsings: string[];
  nullableProperties: boolean;
}

export async function $onEmit(context: EmitContext<EmitterOptions>): Promise<void> {
  if (context.program.compilerOptions.noEmit) {
    return;
  }

  const program = context.program;
  const options = resolveOptions(context);

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
      content: renderFile(ns, usings, renderModel(program, model, options)),
    });

    await emitFile(program, {
      path: resolvePath(options.interfacesOutputDir, ...folder, `I${pascalCase(model.name)}.cs`),
      content: renderFile(ns, usings, renderInterface(program, model, options)),
    });
  }

  for (const en of enums) {
    const ns = csharpNamespaceFor(en.namespace, options);
    const folder = folderSegments(options.rootNamespace, ns);
    await emitFile(program, {
      path: resolvePath(options.modelsOutputDir, ...folder, `${pascalCase(en.name)}.cs`),
      content: renderFile(ns, collectUsings(ns, [], options), renderEnum(en)),
    });
  }
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
    additionalUsings: raw["additional-usings"] ?? [],
    nullableProperties: raw["nullable-properties"] ?? true,
  };
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
  return [...usings].sort((a, b) => {
    const aSystem = a === "System" || a.startsWith("System.");
    const bSystem = b === "System" || b.startsWith("System.");
    if (aSystem !== bSystem) return aSystem ? -1 : 1;
    return a.localeCompare(b);
  });
}

function renderFile(ns: string, usings: string[], block: string[]): string {
  const lines: string[] = [];
  lines.push("// <auto-generated/>");
  lines.push("#nullable enable");
  lines.push("");
  for (const u of usings) lines.push(`using ${u};`);
  lines.push("");
  lines.push(`namespace ${ns}`);
  lines.push("{");

  for (const line of block) lines.push(line.length ? `    ${line}` : "");

  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function renderModel(program: Program, model: Model, options: ResolvedOptions): string[] {
  const lines: string[] = [];
  const doc = getDoc(program, model);
  if (doc) lines.push(...renderDocComment(doc));

  const className = pascalCase(model.name);
  const interfaceName = `I${className}`;
  const bases: string[] = [];
  if (model.baseModel) bases.push(typeReference(model.baseModel));
  bases.push(interfaceName);
  lines.push(`public partial class ${className} : ${bases.join(", ")}`);
  lines.push("{");

  const props = [...model.properties.values()];
  props.forEach((prop, i) => {
    if (i > 0) lines.push("");
    for (const propLine of renderClassProperty(program, prop, options)) {
      lines.push(propLine.length ? `    ${propLine}` : "");
    }
  });

  lines.push("}");
  return lines;
}

function renderInterface(program: Program, model: Model, options: ResolvedOptions): string[] {
  const lines: string[] = [];
  const doc = getDoc(program, model);
  if (doc) lines.push(...renderDocComment(doc));

  const interfaceName = `I${pascalCase(model.name)}`;
  const baseClause = model.baseModel
    ? ` : I${pascalCase(model.baseModel.name)}`
    : "";
  lines.push(`public partial interface ${interfaceName}${baseClause}`);
  lines.push("{");

  const props = [...model.properties.values()];
  props.forEach((prop, i) => {
    if (i > 0) lines.push("");
    for (const propLine of renderInterfaceProperty(program, prop, options)) {
      lines.push(propLine.length ? `    ${propLine}` : "");
    }
  });

  lines.push("}");
  return lines;
}

function renderClassProperty(
  program: Program,
  prop: ModelProperty,
  options: ResolvedOptions,
): string[] {
  const lines: string[] = [];
  const doc = getDoc(program, prop);
  if (doc) lines.push(...renderDocComment(doc));
  lines.push(`public ${propertyTypeName(program, prop, options)} ${pascalCase(prop.name)} { get; set; }`);
  return lines;
}

function renderInterfaceProperty(
  program: Program,
  prop: ModelProperty,
  options: ResolvedOptions,
): string[] {
  const lines: string[] = [];
  const doc = getDoc(program, prop);
  if (doc) lines.push(...renderDocComment(doc));
  lines.push(`${propertyTypeName(program, prop, options)} ${pascalCase(prop.name)} { get; set; }`);
  return lines;
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

function renderEnum(en: Enum): string[] {
  const lines: string[] = [];
  lines.push(`public enum ${pascalCase(en.name)}`);
  lines.push("{");
  const members = [...en.members.values()];
  members.forEach((member, i) => {
    const value = typeof member.value === "number" ? ` = ${member.value}` : "";
    const trailing = i === members.length - 1 ? "" : ",";
    lines.push(`    ${pascalCase(member.name)}${value}${trailing}`);
  });
  lines.push("}");
  return lines;
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

function renderDocComment(doc: string): string[] {
  const lines = doc.split(/\r?\n/);
  const out: string[] = ["/// <summary>"];
  for (const line of lines) out.push(`/// ${line}`);
  out.push("/// </summary>");
  return out;
}

function pascalCase(name: string): string {
  if (!name) return name;
  return name
    .split(/[_\-\s]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join("");
}
