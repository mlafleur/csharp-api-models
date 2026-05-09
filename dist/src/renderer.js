/**
 * @module renderer
 *
 * Handlebars-based template renderer for C# code generation.
 *
 * Provides view-model types that carry structured data from the emitter to the
 * templates, helper functions for rendering individual text fragments (property
 * declarations, operation signatures, etc.), and a factory (`createRenderer`)
 * that compiles all templates once and returns a stateless {@link Renderer}.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";
/** Absolute path to the bundled default templates directory. */
const TEMPLATES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../templates");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Wraps a plain-text doc string in an XML `<summary>` block suitable for
 * inclusion in generated C# source.
 *
 * @param doc - Raw documentation text (may contain newlines).
 * @returns Multi-line string of `/// ` prefixed lines.
 *
 * @example
 * renderDocComment("Gets the user by id.")
 * // → "/// <summary>\n/// Gets the user by id.\n/// </summary>"
 */
export function renderDocComment(doc) {
    const lines = doc.split(/\r?\n/);
    return ["/// <summary>", ...lines.map((l) => `/// ${l}`), "/// </summary>"].join("\n");
}
/**
 * Creates a fresh Handlebars environment with custom helpers registered.
 * A new environment is used per renderer instance so helpers from different
 * invocations cannot bleed into each other.
 *
 * Registered helpers:
 * - `indent` — prefixes every non-empty line with 4 spaces.
 * - `isDefined` — subexpression helper; true when its argument is not `undefined`.
 *
 * @returns Isolated Handlebars environment.
 */
function createHandlebarsEnv() {
    const env = Handlebars.create();
    /**
     * `{{indent text}}` — prefix every non-empty line of `text` with 4 spaces.
     * Used inside body templates to place content inside a namespace or class block.
     */
    env.registerHelper("indent", (content) => {
        if (typeof content !== "string" || !content)
            return "";
        return content
            .split("\n")
            .map((line) => (line.length ? `    ${line}` : ""))
            .join("\n");
    });
    /**
     * `{{isDefined value}}` — returns true when `value` is not `undefined`.
     * Useful in enum templates to distinguish an explicit `= 0` from no value.
     *
     * @example `{{#if (isDefined value)}} = {{value}}{{/if}}`
     */
    env.registerHelper("isDefined", (value) => value !== undefined);
    return env;
}
/**
 * Compiles a Handlebars template source string with HTML escaping disabled.
 *
 * @param env - Handlebars environment to use for compilation.
 * @param source - Raw template source.
 * @returns Compiled template delegate.
 */
function compileTemplate(env, source) {
    return env.compile(source, { noEscape: true });
}
/**
 * Loads and compiles a named template, falling back to the bundled default
 * when no override path is provided.
 *
 * @param env - Handlebars environment for compilation.
 * @param name - Template name (determines the default `.hbs` filename).
 * @param override - Absolute path to a custom template file, or `undefined`.
 * @returns Compiled template delegate.
 * @throws If the template file cannot be read.
 */
function loadTemplate(env, name, override) {
    const path = override ?? resolve(TEMPLATES_DIR, `${name}.hbs`);
    const source = readFileSync(path, "utf-8");
    return compileTemplate(env, source);
}
// ---------------------------------------------------------------------------
// Per-element text renderers
// ---------------------------------------------------------------------------
/**
 * Renders a single class property declaration, including JSON serialization
 * attributes and an optional doc comment line.
 *
 * @param prop - Property view model.
 * @returns Multi-line C# property text (no trailing newline).
 */
function classPropertyText(prop) {
    const parts = [];
    if (prop.doc)
        parts.push(prop.doc);
    parts.push(`[JsonPropertyName("${prop.jsonName}")]`);
    if (prop.nullable)
        parts.push(`[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]`);
    parts.push(`public ${prop.type} ${prop.name} { get; set; }`);
    return parts.join("\n");
}
/**
 * Renders a single interface property declaration (no access modifier),
 * including JSON serialization attributes and an optional doc comment line.
 *
 * @param prop - Property view model.
 * @returns Multi-line C# property text (no trailing newline).
 */
function interfacePropertyText(prop) {
    const parts = [];
    if (prop.doc)
        parts.push(prop.doc);
    parts.push(`[JsonPropertyName("${prop.jsonName}")]`);
    if (prop.nullable)
        parts.push(`[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]`);
    parts.push(`${prop.type} ${prop.name} { get; set; }`);
    return parts.join("\n");
}
/**
 * Renders a single enum member line.
 *
 * @param member - Enum member view model.
 * @param isLast - Whether this is the last member (controls trailing comma).
 * @returns Single-line C# enum member text.
 */
/**
 * Renders a single enum member block: optional doc comment, `[EnumMember]`
 * attribute, and the member declaration with optional numeric value.
 *
 * @param member - Enum member view model.
 * @param isLast - Whether this is the last member (controls trailing comma).
 * @returns Multi-line C# enum member text (no trailing newline).
 */
function enumMemberText(member, isLast) {
    const parts = [];
    if (member.doc)
        parts.push(member.doc);
    parts.push(`[EnumMember(Value = "${member.memberValue}")]`);
    const numericValue = typeof member.value === "number" ? ` = ${member.value}` : "";
    parts.push(`${member.name}${numericValue}${isLast ? "" : ","}`);
    return parts.join("\n");
}
/**
 * Renders a single controller action parameter declaration, including the
 * ASP.NET Core binding attribute.
 *
 * @param p - Parameter view model.
 * @returns Inline C# parameter declaration string, e.g. `[FromRoute] string id`.
 */
function operationParamDecl(p) {
    return `[${p.binding}] ${p.optional ? `${p.type}?` : p.type} ${p.name}`;
}
/**
 * Renders a complete controller action block: optional doc comment, one
 * `[HttpVerb("route")]` attribute per version route, and the `abstract`
 * method signature.
 *
 * @param op - Operation view model.
 * @returns Multi-line indented C# action text (no trailing newline).
 */
function controllerActionBlock(op) {
    const lines = [];
    if (op.doc)
        lines.push(...op.doc.split("\n").map((l) => `    ${l}`));
    for (const route of op.routes) {
        lines.push(`    [Http${op.httpVerb}("${route}")]`);
    }
    const paramList = op.params.map(operationParamDecl).join(", ");
    lines.push(`    public abstract Task<IActionResult> ${op.name}(${paramList});`);
    return lines.join("\n");
}
/**
 * Renders a single service interface method declaration.
 *
 * @param op - Operation view model.
 * @returns Multi-line indented C# method declaration text (no trailing newline).
 */
function serviceMethodDecl(op) {
    const lines = [];
    if (op.doc)
        lines.push(...op.doc.split("\n").map((l) => `    ${l}`));
    const paramList = op.params.map((p) => `${p.optional ? `${p.type}?` : p.type} ${p.name}`).join(", ");
    lines.push(`    Task<${op.returnType}?> ${op.name}Async(${paramList});`);
    return lines.join("\n");
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * Compiles all templates and returns a {@link Renderer} instance.
 *
 * Templates are compiled once at construction time; the returned renderer is
 * cheap to call repeatedly.  Any template name absent from `overrides` falls
 * back to the corresponding bundled `.hbs` file.
 *
 * @param overrides - Optional map of template names to custom file paths.
 * @returns A fully initialised renderer.
 * @throws If any template file (built-in or custom) cannot be read or parsed.
 */
export function createRenderer(overrides = {}) {
    const env = createHandlebarsEnv();
    const fileTemplate = loadTemplate(env, "file", overrides.file);
    const classTemplate = loadTemplate(env, "class", overrides.class);
    const interfaceTemplate = loadTemplate(env, "interface", overrides.interface);
    const enumTemplate = loadTemplate(env, "enum", overrides.enum);
    const controllerTemplate = loadTemplate(env, "controller", overrides.controller);
    const serviceInterfaceTemplate = loadTemplate(env, "service-interface", overrides["service-interface"]);
    const mergePatchTemplate = loadTemplate(env, "merge-patch-value", overrides["merge-patch-value"]);
    const enumMemberConverterTemplate = loadTemplate(env, "enum-member-converter", overrides["enum-member-converter"]);
    return {
        renderFile(view) {
            return fileTemplate(view);
        },
        renderClass(view) {
            const bases = [view.baseClass, view.interfaceName].filter(Boolean);
            return classTemplate({
                ...view,
                bases: bases.join(", "),
                propertiesBlock: view.properties.map(classPropertyText).join("\n\n"),
            });
        },
        renderInterface(view) {
            return interfaceTemplate({
                ...view,
                baseClause: view.baseInterface ? ` : ${view.baseInterface}` : "",
                propertiesBlock: view.properties.map(interfacePropertyText).join("\n\n"),
            });
        },
        renderEnum(view) {
            const last = view.members.length - 1;
            return enumTemplate({
                ...view,
                membersBlock: view.members.map((m, i) => enumMemberText(m, i === last)).join("\n"),
            });
        },
        renderController(view) {
            const actionsBlock = view.operations.length > 0
                ? view.operations.map(controllerActionBlock).join("\n\n") + "\n"
                : "";
            return controllerTemplate({ ...view, actionsBlock });
        },
        renderServiceInterface(view) {
            const methodsBlock = view.operations.length > 0
                ? "\n" + view.operations.map(serviceMethodDecl).join("\n\n")
                : "";
            return serviceInterfaceTemplate({ ...view, methodsBlock });
        },
        renderMergePatchValue() {
            return mergePatchTemplate({});
        },
        renderEnumMemberConverter() {
            return enumMemberConverterTemplate({});
        },
    };
}
//# sourceMappingURL=renderer.js.map