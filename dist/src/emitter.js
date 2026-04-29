import { emitFile, getDoc, getFormat, getNamespaceFullName, isArrayModelType, isRecordModelType, isStdNamespace, isTemplateDeclaration, navigateProgram, NoTarget, resolvePath, } from "@typespec/compiler";
import { reportDiagnostic } from "./lib.js";
import { createRenderer, renderDocComment, } from "./renderer.js";
const DEFAULT_NAMESPACE = "Models";
const SYSTEM_USINGS = ["System", "System.Collections.Generic"];
const SCALAR_MAP = {
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
const FORMAT_MAP = {
    uuid: "Guid",
    guid: "Guid",
    uri: "Uri",
    url: "Uri",
    "date-time": "DateTimeOffset",
    date: "DateOnly",
    time: "TimeOnly",
};
export async function $onEmit(context) {
    if (context.program.compilerOptions.noEmit) {
        return;
    }
    const program = context.program;
    const options = resolveOptions(context);
    const renderer = buildRenderer(program, options);
    if (!renderer)
        return;
    const models = [];
    const enums = [];
    navigateProgram(program, {
        model(model) {
            if (shouldEmitModel(model))
                models.push(model);
        },
        enum(en) {
            if (shouldEmitEnum(en))
                enums.push(en);
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
}
function buildRenderer(program, options) {
    try {
        return createRenderer(options.templates);
    }
    catch (err) {
        const path = findFailingTemplatePath(options.templates, err);
        const name = (Object.entries(options.templates).find(([, p]) => p === path)?.[0] ??
            "unknown");
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
function findFailingTemplatePath(templates, err) {
    const message = err instanceof Error ? err.message : String(err);
    for (const value of Object.values(templates)) {
        if (value && message.includes(value))
            return value;
    }
    return undefined;
}
function resolveOptions(context) {
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
        templates: resolveTemplatePaths(raw.templates),
    };
}
function resolveTemplatePaths(templates) {
    if (!templates)
        return {};
    const out = {};
    for (const name of ["file", "class", "interface", "enum"]) {
        const value = templates[name];
        if (value)
            out[name] = resolvePath(process.cwd(), value);
    }
    return out;
}
function shouldEmitModel(model) {
    if (!model.name)
        return false;
    if (isInStdNamespace(model.namespace))
        return false;
    if (isArrayModelType(model))
        return false;
    if (isRecordModelType(model))
        return false;
    if (isTemplateDeclaration(model))
        return false;
    return true;
}
function shouldEmitEnum(en) {
    if (!en.name)
        return false;
    if (isInStdNamespace(en.namespace))
        return false;
    return true;
}
function isInStdNamespace(ns) {
    let current = ns;
    while (current) {
        if (isStdNamespace(current))
            return true;
        current = current.namespace;
    }
    return false;
}
function namespaceFullName(ns) {
    if (!ns)
        return "";
    return getNamespaceFullName(ns) || "";
}
function csharpNamespaceFor(ns, options) {
    const fullNs = namespaceFullName(ns);
    if (!fullNs)
        return options.rootNamespace ?? DEFAULT_NAMESPACE;
    const mapped = applyNamespaceMap(fullNs, options.namespaceMap);
    return mapped.split(".").map(pascalCase).join(".");
}
function applyNamespaceMap(fullNs, map) {
    for (const { key, value } of map) {
        if (fullNs === key)
            return value;
        if (fullNs.startsWith(key + "."))
            return value + fullNs.slice(key.length);
    }
    return fullNs;
}
function folderSegments(rootNs, csharpNs) {
    if (!rootNs)
        return [];
    if (csharpNs === rootNs)
        return [];
    if (csharpNs.startsWith(rootNs + ".")) {
        return csharpNs.slice(rootNs.length + 1).split(".");
    }
    return [];
}
function modelReferences(model) {
    const refs = [];
    if (model.baseModel)
        refs.push(model.baseModel);
    for (const prop of model.properties.values()) {
        refs.push(prop.type);
    }
    return refs;
}
function* collectReferencedTypes(type) {
    switch (type.kind) {
        case "Model":
            if (isArrayModelType(type) || isRecordModelType(type)) {
                yield* collectReferencedTypes(type.indexer.value);
            }
            else if (type.name) {
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
function collectUsings(ownNamespace, references, options) {
    const usings = new Set(SYSTEM_USINGS);
    for (const u of options.additionalUsings)
        usings.add(u);
    for (const ref of references) {
        for (const type of collectReferencedTypes(ref)) {
            const ns = csharpNamespaceFor(type.namespace, options);
            if (ns && ns !== ownNamespace)
                usings.add(ns);
        }
    }
    return [...usings].sort((a, b) => {
        const aSystem = a === "System" || a.startsWith("System.");
        const bSystem = b === "System" || b.startsWith("System.");
        if (aSystem !== bSystem)
            return aSystem ? -1 : 1;
        return a.localeCompare(b);
    });
}
function buildClassView(program, model, options) {
    const className = pascalCase(model.name);
    return {
        doc: docFor(program, model),
        className,
        interfaceName: `I${className}`,
        baseClass: model.baseModel ? typeReference(model.baseModel) : undefined,
        properties: buildPropertyViews(program, model, options),
    };
}
function buildInterfaceView(program, model, options) {
    return {
        doc: docFor(program, model),
        interfaceName: `I${pascalCase(model.name)}`,
        baseInterface: model.baseModel ? `I${pascalCase(model.baseModel.name)}` : undefined,
        properties: buildPropertyViews(program, model, options),
    };
}
function buildEnumView(en) {
    return {
        enumName: pascalCase(en.name),
        members: [...en.members.values()].map((member) => ({
            name: pascalCase(member.name),
            value: typeof member.value === "number" ? member.value : undefined,
        })),
    };
}
function buildPropertyViews(program, model, options) {
    return [...model.properties.values()].map((prop) => ({
        doc: docFor(program, prop),
        type: propertyTypeName(program, prop, options),
        name: pascalCase(prop.name),
    }));
}
function docFor(program, target) {
    const doc = getDoc(program, target);
    return doc ? renderDocComment(doc) : undefined;
}
function propertyTypeName(program, prop, options) {
    const propFormat = getFormat(program, prop);
    const scalarFormat = prop.type.kind === "Scalar" ? getFormat(program, prop.type) : undefined;
    const format = propFormat ?? scalarFormat;
    let type;
    if (format && FORMAT_MAP[format.toLowerCase()]) {
        type = FORMAT_MAP[format.toLowerCase()];
    }
    else {
        type = typeReference(prop.type);
    }
    const nullable = prop.optional || options.nullableProperties;
    return nullable && !type.endsWith("?") ? `${type}?` : type;
}
function typeReference(type) {
    switch (type.kind) {
        case "Scalar": {
            const mapped = SCALAR_MAP[type.name];
            if (mapped)
                return mapped;
            let parent = type.baseScalar;
            while (parent) {
                const m = SCALAR_MAP[parent.name];
                if (m)
                    return m;
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
            const nonNull = variants.filter((v) => !(v.type.kind === "Intrinsic" && v.type.name === "null"));
            const hasNull = nonNull.length !== variants.length;
            if (nonNull.length === 1) {
                const ref = typeReference(nonNull[0].type);
                return hasNull ? `${ref}?` : ref;
            }
            return "object";
        }
        case "Intrinsic":
            if (type.name === "null")
                return "object?";
            return "object";
        case "Tuple":
            return "object";
        default:
            return "object";
    }
}
function pascalCase(name) {
    if (!name)
        return name;
    return name
        .split(/[_\-\s]+/)
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
        .join("");
}
//# sourceMappingURL=emitter.js.map