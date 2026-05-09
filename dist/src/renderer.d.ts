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
/**
 * Names of the built-in Handlebars templates.
 * Each name maps to a `<name>.hbs` file inside {@link TEMPLATES_DIR}.
 */
export type TemplateName = "file" | "class" | "interface" | "enum" | "controller" | "service-interface" | "merge-patch-value" | "enum-member-converter";
/**
 * Partial map of template names to absolute file paths used to override the
 * built-in defaults.  Any template not listed here falls back to its bundled
 * counterpart.
 */
export type TemplateOverrides = Partial<Record<TemplateName, string>>;
/** View model for a single C# property declaration. */
export interface PropertyView {
    /** Optional XML `<summary>` doc comment (pre-rendered). */
    doc?: string;
    /** Fully-qualified C# type string, e.g. `"string?"` or `"IList<Guid>?"`. */
    type: string;
    /** PascalCase property name. */
    name: string;
    /** camelCase JSON property name for `[JsonPropertyName]`, e.g. `"firstName"`. */
    jsonName: string;
    /** `true` when the type is nullable (ends with `?`); drives `[JsonIgnore]`. */
    nullable: boolean;
}
/** View model for a C# class (`public partial class`). */
export interface ClassView {
    /** Optional XML `<summary>` doc comment (pre-rendered). */
    doc?: string;
    /** PascalCase class name. */
    className: string;
    /** Name of the generated companion interface, e.g. `"IUser"`. */
    interfaceName: string;
    /** Name of the C# base class if the TypeSpec model extends another model. */
    baseClass?: string;
    /** Ordered list of property view models for this class. */
    properties: PropertyView[];
}
/** View model for a C# interface (`public partial interface`). */
export interface InterfaceView {
    /** Optional XML `<summary>` doc comment (pre-rendered). */
    doc?: string;
    /** Interface name, e.g. `"IUser"`. */
    interfaceName: string;
    /** Name of the base interface when the model uses `extends`, e.g. `"IAnimal"`. */
    baseInterface?: string;
    /** Ordered list of property view models for this interface. */
    properties: PropertyView[];
}
/** View model for a single C# enum member. */
export interface EnumMemberView {
    /** Optional XML `<summary>` doc comment (pre-rendered). */
    doc?: string;
    /** PascalCase member name. */
    name: string;
    /**
     * Wire string written to / read from JSON.  Taken from the TypeSpec string
     * value when present, otherwise the original (un-PascalCased) TypeSpec name.
     * Written as `[EnumMember(Value = "...")]` on the generated member.
     */
    memberValue: string;
    /**
     * Explicit numeric value, present only when the TypeSpec member carries an
     * integer literal value.  Omitted for string-valued or auto-numbered members.
     */
    value?: number;
}
/** View model for a C# enum declaration. */
export interface EnumView {
    /** Optional XML `<summary>` doc comment (pre-rendered). */
    doc?: string;
    /** PascalCase enum name. */
    enumName: string;
    /** Ordered list of enum members. */
    members: EnumMemberView[];
}
/**
 * View model passed to the `file` template.
 * Wraps any inner declaration (class, interface, enum) with the namespace
 * block and `using` directives.
 */
export interface FileView {
    /** Fully-qualified C# namespace string. */
    namespace: string;
    /** Sorted list of `using` directive namespaces (without the `using` keyword). */
    usings: string[];
    /** Pre-rendered inner declaration body to be placed inside the namespace block. */
    body: string;
    /**
     * The filename (basename only, no directory) of the file being emitted,
     * e.g. `"Person.g.cs"` or `"IUser.g.cs"`.
     * Available in templates as `{{fileName}}`.
     */
    fileName: string;
}
/** View model for a single action-method parameter. */
export interface OperationParamView {
    /** camelCase parameter name. */
    name: string;
    /** C# type string (non-nullable; optional marker is added by the renderer). */
    type: string;
    /** ASP.NET Core binding source attribute name (without brackets). */
    binding: "FromRoute" | "FromQuery" | "FromBody" | "FromHeader";
    /** Whether the parameter is optional in the TypeSpec definition. */
    optional: boolean;
}
/** View model for a single controller action / service method. */
export interface OperationView {
    /** Optional XML `<summary>` doc comment (pre-rendered). */
    doc?: string;
    /** PascalCase operation name, used as both method name and service method stem. */
    name: string;
    /** PascalCase HTTP verb, e.g. `"Get"`, `"Post"`. */
    httpVerb: string;
    /**
     * Full absolute route strings for this operation, one per API version.
     * e.g. `["/api/v1/users/{id}", "/api/v2/users/{id}"]`.
     * Each string becomes its own `[HttpVerb("...")]` attribute on the method.
     */
    routes: string[];
    /**
     * Route template suffix from the TypeSpec `@route` decorator on the
     * operation itself, e.g. `"{id}"`.  Informational only — not used for
     * controller routing.  `undefined` when the operation sits at the
     * container root.
     */
    routeSuffix?: string;
    /** Ordered list of parameter view models. */
    params: OperationParamView[];
    /** C# return type for the service method, e.g. `"User"` or `"IList<Widget>"`. */
    returnType: string;
}
/** View model for an ASP.NET Core abstract controller class. */
export interface ControllerView {
    /** Optional XML `<summary>` doc comment (pre-rendered). */
    doc?: string;
    /** Full class name including the abstract suffix, e.g. `"UsersControllerBase"`. */
    controllerName: string;
    /** Abstract service class name, e.g. `"UsersServiceBase"`. */
    serviceName: string;
    /** Service interface name, e.g. `"IUsersService"`. */
    serviceInterfaceName: string;
    /** Ordered list of action-method view models. */
    operations: OperationView[];
}
/** View model for a service interface (`public interface I<Name>Service`). */
export interface ServiceView {
    /** Optional XML `<summary>` doc comment (pre-rendered). */
    doc?: string;
    /** Abstract service class name, e.g. `"UsersServiceBase"`. */
    serviceName: string;
    /** Service interface name, e.g. `"IUsersService"`. */
    interfaceName: string;
    /** Ordered list of service-method view models. */
    operations: OperationView[];
}
/**
 * Stateless code renderer.  Each method accepts a view model and returns the
 * rendered C# source fragment as a string.
 *
 * Obtain an instance via {@link createRenderer}.
 */
export interface Renderer {
    /** Renders the full file content: `// <auto-generated/>`, usings, namespace block. */
    renderFile(view: FileView): string;
    /** Renders a `public partial class` declaration with its properties. */
    renderClass(view: ClassView): string;
    /** Renders a `public partial interface` declaration with its properties. */
    renderInterface(view: InterfaceView): string;
    /** Renders a `public enum` declaration with its members. */
    renderEnum(view: EnumView): string;
    /** Renders an `[ApiController] public abstract class` controller declaration. */
    renderController(view: ControllerView): string;
    /** Renders a `public interface I<Name>Service` declaration. */
    renderServiceInterface(view: ServiceView): string;
    /** Renders the static `MergePatchValue<T>` helper class body. */
    renderMergePatchValue(): string;
    /** Renders the `EnumMemberConverterFactory` and `EnumMemberConverter<T>` helper class body. */
    renderEnumMemberConverter(): string;
}
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
export declare function renderDocComment(doc: string): string;
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
export declare function createRenderer(overrides?: TemplateOverrides): Renderer;
