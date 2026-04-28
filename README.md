# @mlafleur/csharp-api-models

A TypeSpec emitter that generates C# model classes and matching interfaces from TypeSpec definitions.

For each TypeSpec `model`, the emitter produces:

- A `public partial class <Name>` that implements its interface
- A `public partial interface I<Name>` with the same properties

TypeSpec `enum` declarations emit as C# `enum`. Standard-library types are skipped.

## Install

```bash
npm install --save-dev @mlafleur/csharp-api-models
```

## Configure

Add the emitter to your `tspconfig.yaml`:

```yaml
emit:
  - "@mlafleur/csharp-api-models"

options:
  "@mlafleur/csharp-api-models":
    root-namespace: MyCompany.Api
    nullable-properties: true
    models-output-dir: "{cwd}/src/Models"
    interfaces-output-dir: "{cwd}/src/Interfaces"
    additional-usings:
      - System.Text.Json.Serialization
    namespace-map:
      Legacy.Common: MyCompany.Api.Common
```

Then run the compiler:

```bash
npx tsp compile .
```

## Options

| Option                  | Type                     | Default              | Purpose                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root-namespace`        | `string`                 | _(unset)_            | C# namespace prefix that is **stripped** from folder paths so the directory tree mirrors the namespace tree below the root. When unset, files are written flat at the output dir; the C# `namespace` declaration still reflects the original TypeSpec namespace. |
| `namespace-map`         | `Record<string, string>` | `{}`                 | Rewrites TypeSpec namespaces into different C# namespaces. Longest-prefix match wins; sub-namespaces inherit the rewrite.                                                                                                                                        |
| `models-output-dir`     | `string`                 | `emitter-output-dir` | Override destination for class and enum files. Absolute, or relative to `emitter-output-dir`.                                                                                                                                                                    |
| `interfaces-output-dir` | `string`                 | `emitter-output-dir` | Override destination for interface files. Absolute, or relative to `emitter-output-dir`.                                                                                                                                                                         |
| `additional-usings`     | `string[]`               | `[]`                 | Extra `using` directives included in every generated file (deduplicated against built-in and reference-derived usings).                                                                                                                                          |
| `nullable-properties`   | `boolean`                | `true`               | When `true`, every property is rendered nullable (`string?`, `int?`). Set to `false` to make only `?` (optional) properties and `T \| null` unions nullable.                                                                                                     |

`emitter-output-dir` is the standard TypeSpec compiler option and is supported automatically.

## Type mapping

| TypeSpec                                 | C#                                   |
| ---------------------------------------- | ------------------------------------ |
| `string`                                 | `string`                             |
| `boolean`                                | `bool`                               |
| `bytes`                                  | `byte[]`                             |
| `int8` / `int16` / `int32` / `int64`     | `sbyte` / `short` / `int` / `long`   |
| `uint8` / `uint16` / `uint32` / `uint64` | `byte` / `ushort` / `uint` / `ulong` |
| `safeint`, `integer`                     | `long`                               |
| `float`, `float64`, `numeric`            | `double`                             |
| `float32`                                | `float`                              |
| `decimal`, `decimal128`                  | `decimal`                            |
| `plainDate`                              | `DateOnly`                           |
| `plainTime`                              | `TimeOnly`                           |
| `utcDateTime`, `offsetDateTime`          | `DateTimeOffset`                     |
| `duration`                               | `TimeSpan`                           |
| `url`                                    | `Uri`                                |
| `T[]`                                    | `IList<T>`                           |
| `Record<T>`                              | `IDictionary<string, T>`             |
| `T \| null`                              | `T?`                                 |
| Other unions, tuples                     | `object`                             |

Custom scalars walk up to their nearest known base. Unmapped scalars fall back to `object`.

## `@format` overrides

When a property (or its scalar type) carries `@format(...)`, the format wins over the underlying type:

| `@format` value | C#               |
| --------------- | ---------------- |
| `uuid`, `guid`  | `Guid`           |
| `uri`, `url`    | `Uri`            |
| `date-time`     | `DateTimeOffset` |
| `date`          | `DateOnly`       |
| `time`          | `TimeOnly`       |

Unknown formats fall through to the underlying type.

## Example

Input:

```typespec
@doc("A user record")
namespace MyCompany.Api.Users;

model User {
  @format("uuid")
  id: string;

  name: string;
  active: boolean;
  joined?: utcDateTime;
}
```

With `root-namespace: MyCompany.Api`, the emitter writes:

- `Users/User.cs`

  ```csharp
  // <auto-generated/>
  #nullable enable

  using System;
  using System.Collections.Generic;

  namespace MyCompany.Api.Users
  {
      /// <summary>
      /// A user record
      /// </summary>
      public partial class User : IUser
      {
          public Guid? Id { get; set; }

          public string? Name { get; set; }

          public bool? Active { get; set; }

          public DateTimeOffset? Joined { get; set; }
      }
  }
  ```

- `Users/IUser.cs`

  ```csharp
  // <auto-generated/>
  #nullable enable

  using System;
  using System.Collections.Generic;

  namespace MyCompany.Api.Users
  {
      /// <summary>
      /// A user record
      /// </summary>
      public partial interface IUser
      {
          Guid? Id { get; set; }

          string? Name { get; set; }

          bool? Active { get; set; }

          DateTimeOffset? Joined { get; set; }
      }
  }
  ```

## Cross-namespace references

When a model references a type from another namespace, the emitter adds the corresponding `using` automatically. References inside `IList<T>`, `IDictionary<string, T>`, unions, and base classes are tracked. The mapped namespace from `namespace-map` is used when generating the `using`, so consumers always see the rewritten name.

## Output layout

Given `models-output-dir: src/Models`, `interfaces-output-dir: src/Interfaces`, and `root-namespace: MyCompany.Api`:

```
emitter-output-dir/
  src/Models/
    Users/
      User.cs
      Color.cs
  src/Interfaces/
    Users/
      IUser.cs
```

Models in namespaces outside the `root-namespace` prefix are placed flat at the output root, while keeping their original C# namespace in the file.

## Develop

```bash
npm install
npm run build      # tsc src/ + tsc test/
npm test           # node --test on dist/
npm run format     # prettier
npm run lint       # eslint
```
