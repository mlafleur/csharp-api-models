import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";
const TEMPLATES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../templates");
export function renderDocComment(doc) {
    const lines = doc.split(/\r?\n/);
    return ["/// <summary>", ...lines.map((l) => `/// ${l}`), "/// </summary>"].join("\n");
}
function createHandlebarsEnv() {
    const env = Handlebars.create();
    env.registerHelper("indent", (content) => {
        if (typeof content !== "string" || !content)
            return "";
        return content
            .split("\n")
            .map((line) => (line.length ? `    ${line}` : ""))
            .join("\n");
    });
    return env;
}
function compileTemplate(env, source) {
    return env.compile(source, { noEscape: true });
}
function loadTemplate(env, name, override) {
    const path = override ?? resolve(TEMPLATES_DIR, `${name}.hbs`);
    const source = readFileSync(path, "utf-8");
    return compileTemplate(env, source);
}
function classPropertyText(prop) {
    const parts = [];
    if (prop.doc)
        parts.push(prop.doc);
    parts.push(`public ${prop.type} ${prop.name} { get; set; }`);
    return parts.join("\n");
}
function interfacePropertyText(prop) {
    const parts = [];
    if (prop.doc)
        parts.push(prop.doc);
    parts.push(`${prop.type} ${prop.name} { get; set; }`);
    return parts.join("\n");
}
function enumMemberText(member, isLast) {
    const value = typeof member.value === "number" ? ` = ${member.value}` : "";
    const trailing = isLast ? "" : ",";
    return `${member.name}${value}${trailing}`;
}
export function createRenderer(overrides = {}) {
    const env = createHandlebarsEnv();
    const fileTemplate = loadTemplate(env, "file", overrides.file);
    const classTemplate = loadTemplate(env, "class", overrides.class);
    const interfaceTemplate = loadTemplate(env, "interface", overrides.interface);
    const enumTemplate = loadTemplate(env, "enum", overrides.enum);
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
    };
}
//# sourceMappingURL=renderer.js.map