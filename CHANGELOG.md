# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- **Namespace inference from TypeSpec when `root-namespace` is not set** — Controllers,
  services, and helpers now automatically derive their C# namespace from the TypeSpec
  namespace declared in the spec, rather than using bare directory names.

  | TypeSpec | Before | After |
  |---|---|---|
  | `namespace Demo;` | `namespace Controllers` | `namespace Demo.Controllers` |
  | `namespace My.App;` | `namespace Services` | `namespace My.App.Services` |
  | `namespace My.App;` | `namespace Helpers` | `namespace My.App.Helpers` |

  The inference walks the namespace tree from the global namespace through single-child
  chains, finding the deepest namespace common to all user-defined types.  When
  `root-namespace` is set explicitly, it continues to take precedence.  Model and
  interface namespace resolution is unchanged — they continue to use the TypeSpec
  namespace (or `namespace-map`) directly.

### Changed

- **`namespace-from-path` now applies to all generated files** — Previously
  `namespace-from-path: true` (the default) only affected controllers, services,
  and helpers.  Models, interfaces, and enums continued to use the TypeSpec
  namespace regardless of the option.  Now all file types derive their C#
  namespace from `root-namespace` combined with their output directory path,
  making the namespace strategy consistent across the entire output:

  | Output dir option | With `root-namespace: "MyApp"` |
  |---|---|
  | `models-output-dir: "Models"` | `namespace MyApp.Models` |
  | `interfaces-output-dir: "Interfaces"` | `namespace MyApp.Interfaces` |
  | `controllers-output-dir: "Controllers"` | `namespace MyApp.Controllers` *(unchanged)* |
  | `helpers-output-dir: "Helpers"` | `namespace MyApp.Helpers` *(unchanged)* |

  When `namespace-from-path: false` is explicitly set, the previous behaviour
  is preserved: models/interfaces/enums use the TypeSpec namespace, and
  controllers/services use the namespace of their TypeSpec container.

- **`ResolvedOptions` gains `modelsPathNamespace` and `interfacesPathNamespace`**
  — parallel to the existing `controllersPathNamespace` and
  `servicesPathNamespace` fields.

- **`collectUsings` respects `namespace-from-path`** — when path-based
  namespaces are active, cross-model `using` directives are elided (all
  models share the same namespace); references to types in a different
  namespace (e.g. a companion interface in `interfacesPathNamespace`) still
  generate the correct `using`.

- **Class files include a `using` for the interface namespace** when
  `models-output-dir` and `interfaces-output-dir` resolve to different path
  namespaces (e.g. `MyApp.Models` vs `MyApp.Interfaces`).

### Added

- **`EnumMemberConverter<T>` helper** — a new `System.Text.Json` converter that
  serializes enum values using the string declared in each member's
  `[EnumMember(Value = "...")]` attribute (from `System.Runtime.Serialization`).
  Deserialization is case-insensitive. The converter is emitted as
  `EnumMemberConverter.g.cs` into the helpers output directory alongside
  `MergePatchValue.g.cs`.

- **`EnumMemberConverterFactory`** — a `JsonConverterFactory` wrapper, also
  emitted in `EnumMemberConverter.g.cs`, that enables the converter to be
  registered via `[JsonConverter(typeof(EnumMemberConverterFactory))]` without
  specifying the enum type parameter explicitly.

- **`[EnumMember(Value = "...")]` on generated enum members** — every
  generated enum member now carries an `[EnumMember]` attribute whose `Value`
  property holds the JSON wire string.  For TypeSpec members with an explicit
  string value that value is used; for all other members the original TypeSpec
  member name is used.

- **XML doc comments on enum types and members** — generated enums now emit
  `/// <summary>` blocks for the enum type and for each member, sourced from
  `@doc` annotations in the TypeSpec source.

- **`enum-member-converter` template override** — consumers can supply a
  custom `enum-member-converter.hbs` via `tspconfig.yaml`:
  ```yaml
  options:
    "@mlafleur/csharp-api-models":
      templates:
        enum-member-converter: "./templates/enum-member-converter.hbs"
  ```

### Changed

- **Enum converter switched from `JsonStringEnumConverter` to
  `EnumMemberConverterFactory`** — all generated enums now use the new
  `[JsonConverter(typeof(EnumMemberConverterFactory))]` attribute.

- **Enum file `using` directives** — generated enum files now include
  `System.Runtime.Serialization` and the helpers namespace so that
  `EnumMemberConverterFactory` and `EnumMemberAttribute` are in scope.

- **`enum.hbs` template** — the `membersBlock` shortcut now includes
  `[EnumMember]` attributes and optional doc comments per member, making the
  template body cleaner (`{{indent membersBlock}}`).

- **`EnumMemberView`** — added `doc?: string` and `memberValue: string` fields
  to the view model.

- **`EnumView`** — added `doc?: string` field to the view model.
