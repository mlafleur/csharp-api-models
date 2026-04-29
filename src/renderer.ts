import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";

const TEMPLATES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../templates");

export type TemplateName = "file" | "class" | "interface" | "enum";

export type TemplateOverrides = Partial<Record<TemplateName, string>>;

export interface PropertyView {
  doc?: string;
  type: string;
  name: string;
}

export interface ClassView {
  doc?: string;
  className: string;
  interfaceName: string;
  baseClass?: string;
  properties: PropertyView[];
}

export interface InterfaceView {
  doc?: string;
  interfaceName: string;
  baseInterface?: string;
  properties: PropertyView[];
}

export interface EnumMemberView {
  name: string;
  value?: number;
}

export interface EnumView {
  enumName: string;
  members: EnumMemberView[];
}

export interface FileView {
  namespace: string;
  usings: string[];
  body: string;
}

export interface Renderer {
  renderFile(view: FileView): string;
  renderClass(view: ClassView): string;
  renderInterface(view: InterfaceView): string;
  renderEnum(view: EnumView): string;
}

export function renderDocComment(doc: string): string {
  const lines = doc.split(/\r?\n/);
  return ["/// <summary>", ...lines.map((l) => `/// ${l}`), "/// </summary>"].join("\n");
}

function createHandlebarsEnv(): typeof Handlebars {
  const env = Handlebars.create();
  env.registerHelper("indent", (content: unknown) => {
    if (typeof content !== "string" || !content) return "";
    return content
      .split("\n")
      .map((line) => (line.length ? `    ${line}` : ""))
      .join("\n");
  });
  return env;
}

function compileTemplate(env: typeof Handlebars, source: string): HandlebarsTemplateDelegate {
  return env.compile(source, { noEscape: true });
}

function loadTemplate(
  env: typeof Handlebars,
  name: TemplateName,
  override: string | undefined,
): HandlebarsTemplateDelegate {
  const path = override ?? resolve(TEMPLATES_DIR, `${name}.hbs`);
  const source = readFileSync(path, "utf-8");
  return compileTemplate(env, source);
}

function classPropertyText(prop: PropertyView): string {
  const parts: string[] = [];
  if (prop.doc) parts.push(prop.doc);
  parts.push(`public ${prop.type} ${prop.name} { get; set; }`);
  return parts.join("\n");
}

function interfacePropertyText(prop: PropertyView): string {
  const parts: string[] = [];
  if (prop.doc) parts.push(prop.doc);
  parts.push(`${prop.type} ${prop.name} { get; set; }`);
  return parts.join("\n");
}

function enumMemberText(member: EnumMemberView, isLast: boolean): string {
  const value = typeof member.value === "number" ? ` = ${member.value}` : "";
  const trailing = isLast ? "" : ",";
  return `${member.name}${value}${trailing}`;
}

export function createRenderer(overrides: TemplateOverrides = {}): Renderer {
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
      const bases = [view.baseClass, view.interfaceName].filter(Boolean) as string[];
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
