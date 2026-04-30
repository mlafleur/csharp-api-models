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
    controllers-output-dir: "{cwd}/src/Controllers"
    services-output-dir: "{cwd}/src/Services"
    route-prefix: api
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
| `nullable-properties`      | `boolean`                | `true`               | When `true`, every property is rendered nullable (`string?`, `int?`). Set to `false` to make only `?` (optional) properties and `T \| null` unions nullable.                                                                                                     |
| `controllers-output-dir`   | `string`                 | `emitter-output-dir` | Destination for generated controller files.                                                                                                                                                                                                                       |
| `services-output-dir`      | `string`                 | `emitter-output-dir` | Destination for generated service interface and class files.                                                                                                                                                                                                      |
| `route-prefix`             | `string`                 | `""`                 | Prefix prepended to every controller route. Set to `api` to produce `/api/v1/users`-style paths.                                                                                                                                                                  |
| `templates`                | `Record<string, string>` | `{}`                 | Per-template path overrides. Keys: `file`, `class`, `interface`, `enum`, `controller`, `service-class`, `service-interface`. Paths are relative to CWD.                                                                                                          |

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

## Controllers and services

When the TypeSpec source includes `@typespec/http` operations, the emitter also produces ASP.NET Core controllers and matching services.

For each HTTP `interface` (or `namespace`) that carries routes, the emitter writes three files:

| File | Content |
| --- | --- |
| `<Name>Controller.cs` | ASP.NET Core controller that inherits `ControllerBase`, injects `I<Name>Service`, and delegates every action to the service. |
| `I<Name>Service.cs` | Service interface with one `Task<T>` method per operation. |
| `<Name>Service.cs` | Service class implementing the interface; each method throws `NotImplementedException` as a starting stub. |

**Routes** — one `[Route]` attribute is emitted per API version defined via `@typespec/versioning`. Without versioning there is one attribute using the TypeSpec route path.

```typespec
import "@typespec/http";
import "@typespec/versioning";
using TypeSpec.Http;
using TypeSpec.Versioning;

@service
@versioned(Versions)
namespace MyApi;

enum Versions { v1, v2 }

model User { id: string; name: string; }

@route("/users")
interface Users {
  @get list(): User[];
  @get @route("{id}") read(@path id: string): User;
  @post create(@body user: User): User;
}
```

With `route-prefix: api`, the above produces `UsersController.cs`:

```csharp
// <auto-generated/>
#nullable enable

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace MyApi
{
    [Route("/api/v1/users")]
    [Route("/api/v2/users")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly IUsersService _service;

        public UsersController(IUsersService service)
        {
            _service = service;
        }

        [HttpGet]
        public async Task<IActionResult> List()
        {
            return Ok(await _service.List());
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> Read([FromRoute] string id)
        {
            return Ok(await _service.Read(id));
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] User body)
        {
            return Ok(await _service.Create(body));
        }
    }
}
```

And `IUsersService.cs`:

```csharp
// <auto-generated/>
#nullable enable

using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MyApi
{
    public interface IUsersService
    {
        Task<IList<User>> List();

        Task<User> Read(string id);

        Task<User> Create(User body);
    }
}
```

**Parameter binding** — path parameters get `[FromRoute]`, query parameters get `[FromQuery]`, headers get `[FromHeader]`, and request bodies get `[FromBody]`.

## Custom templates

Each generated artifact is rendered from a Handlebars template that ships with the emitter. Any of the four can be replaced via the `templates` option:

```yaml
options:
  "@mlafleur/csharp-api-models":
    templates:
      class: ./templates/class.hbs
      interface: ./templates/interface.hbs
      enum: ./templates/enum.hbs
      file: ./templates/file.hbs
```

A custom template is compiled with `noEscape: true` (so `<`, `>`, `&` pass through unchanged) and receives the view model documented below. The built-in `indent` helper prefixes each non-empty line of its argument with four spaces.

| Template             | View model                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file`               | `{ namespace: string, usings: string[], body: string }` — `body` is the already-rendered inner block.                                                                                                                                                                                                                                                           |
| `class`              | `{ doc?: string, className: string, interfaceName: string, baseClass?: string, bases: string, properties: Property[], propertiesBlock: string }` — `bases` is `baseClass` and `interfaceName` joined by `, `; `propertiesBlock` is each property pre-rendered and joined by a blank line; iterate `properties` directly for finer-grained control.              |
| `interface`          | `{ doc?: string, interfaceName: string, baseInterface?: string, baseClause: string, properties: Property[], propertiesBlock: string }` — `baseClause` is `" : <baseInterface>"` or `""`.                                                                                                                                                                        |
| `enum`               | `{ enumName: string, members: Member[], membersBlock: string }` — `membersBlock` is each member pre-rendered with trailing commas and joined by newlines.                                                                                                                                                                                                       |
| `controller`         | `{ doc?: string, controllerName: string, serviceName: string, serviceInterfaceName: string, routes: string[], operations: Operation[], actionsBlock: string }` — `routes` has one entry per API version; `actionsBlock` is the pre-rendered constructor-separated action blocks (4-space indented).                                                               |
| `service-interface`  | `{ doc?: string, interfaceName: string, serviceName: string, operations: Operation[], methodsBlock: string }` — `methodsBlock` is each `Task<T>` declaration pre-rendered (4-space indented).                                                                                                                                                                    |
| `service-class`      | `{ doc?: string, serviceName: string, interfaceName: string, operations: Operation[], methodsBlock: string }` — `methodsBlock` is each method stub pre-rendered (4-space indented).                                                                                                                                                                              |

`Property` is `{ doc?: string, type: string, name: string }`; `Member` is `{ name: string, value?: number }`. `Operation` is `{ doc?: string, name: string, httpVerb: string, routeSuffix?: string, params: Param[], returnType: string }`. `Param` is `{ name: string, type: string, binding: string, optional: boolean }`. `doc` (when present) is a fully formatted XML doc-comment block — emit it verbatim above the declaration.

## Develop

```bash
npm install
npm run build      # tsc src/ + tsc test/
npm test           # node --test on dist/
npm run format     # prettier
npm run lint       # eslint
```
