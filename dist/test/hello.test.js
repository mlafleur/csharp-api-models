import { ok, strictEqual } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { emit, emitWithDiagnostics } from "./host.js";
function writeTemplate(name, content) {
    const dir = mkdtempSync(join(tmpdir(), "csharp-tpl-"));
    const file = join(dir, `${name}.hbs`);
    writeFileSync(file, content);
    return file;
}
describe("csharp emitter", () => {
    describe("default layout (no root-namespace)", () => {
        it("emits each model flat at the root of the output dir", async () => {
            const results = await emit(`
        namespace Demo;
        model Person { name: string; age: int32; }
        model Address { city: string; }
      `);
            ok(results["Person.cs"], "expected Person.cs at root");
            ok(results["Address.cs"], "expected Address.cs at root");
            ok(!Object.keys(results).some((k) => k.includes("/")), "no subdirectories expected");
        });
        it("uses default namespace for top-level models", async () => {
            const results = await emit(`model Loose { x: int32; }`);
            const file = results["Loose.cs"];
            ok(file, "expected Loose.cs at root");
            ok(file.includes("namespace Models"));
        });
        it("uses original TypeSpec namespace as the C# namespace", async () => {
            const results = await emit(`
        namespace App.Users;
        model User { id: string; }
      `);
            const file = results["User.cs"];
            ok(file, "expected User.cs at root");
            ok(file.includes("namespace App.Users"));
        });
    });
    describe("root-namespace option", () => {
        it("strips root namespace from folder paths", async () => {
            const results = await emit(`
          namespace App.Users;
          model User { id: string; }
        `, { "root-namespace": "App" });
            const file = results["Users/User.cs"];
            ok(file, `expected Users/User.cs, got ${Object.keys(results).join(", ")}`);
            ok(file.includes("namespace App.Users"));
        });
        it("places models at root when their namespace equals the root namespace", async () => {
            const results = await emit(`
          namespace App;
          model Root { id: string; }
        `, { "root-namespace": "App" });
            const file = results["Root.cs"];
            ok(file, "expected Root.cs at output root");
            ok(file.includes("namespace App"));
        });
        it("places top-level models at root with the root namespace as their C# namespace", async () => {
            const results = await emit(`model Free { id: string; }`, {
                "root-namespace": "App",
            });
            const file = results["Free.cs"];
            ok(file, "expected Free.cs");
            ok(file.includes("namespace App"));
        });
        it("places models outside the root namespace at the output root, keeping their namespace", async () => {
            const results = await emit(`
          namespace Other.Stuff;
          model Foreign { id: string; }
        `, { "root-namespace": "App" });
            const file = results["Foreign.cs"];
            ok(file, "expected Foreign.cs at root");
            ok(file.includes("namespace Other.Stuff"));
        });
        it("supports nested root namespace prefixes", async () => {
            const results = await emit(`
          namespace App.Api.V1.Users;
          model User { id: string; }
        `, { "root-namespace": "App.Api" });
            const file = results["V1/Users/User.cs"];
            ok(file, `expected V1/Users/User.cs, got ${Object.keys(results).join(", ")}`);
            ok(file.includes("namespace App.Api.V1.Users"));
        });
    });
    describe("@format-based type mapping", () => {
        it("maps uuid to Guid", async () => {
            const results = await emit(`
        namespace Demo;
        model M { @format("uuid") id: string; }
      `);
            ok(results["M.cs"].includes("public Guid? Id { get; set; }"));
        });
        it("maps guid (alias) to Guid", async () => {
            const results = await emit(`
        namespace Demo;
        model M { @format("guid") id: string; }
      `);
            ok(results["M.cs"].includes("public Guid? Id { get; set; }"));
        });
        it("maps uri to Uri", async () => {
            const results = await emit(`
        namespace Demo;
        model M { @format("uri") link: string; }
      `);
            ok(results["M.cs"].includes("public Uri? Link { get; set; }"));
        });
        it("maps date-time format to DateTimeOffset", async () => {
            const results = await emit(`
        namespace Demo;
        model M { @format("date-time") at: string; }
      `);
            ok(results["M.cs"].includes("public DateTimeOffset? At { get; set; }"));
        });
        it("preserves nullable on optional formatted properties", async () => {
            const results = await emit(`
        namespace Demo;
        model M { @format("uuid") id?: string; }
      `);
            ok(results["M.cs"].includes("public Guid? Id { get; set; }"));
        });
        it("falls back to the underlying type when the format is unknown", async () => {
            const results = await emit(`
        namespace Demo;
        model M { @format("unknown-thing") name: string; }
      `);
            ok(results["M.cs"].includes("public string? Name { get; set; }"));
        });
    });
    describe("type mapping", () => {
        it("emits a simple model with primitive properties", async () => {
            const results = await emit(`
        namespace Demo;
        model Person { name: string; age: int32; active: boolean; }
      `);
            const file = results["Person.cs"];
            ok(file.includes("public partial class Person"));
            ok(file.includes("public string? Name { get; set; }"));
            ok(file.includes("public int? Age { get; set; }"));
            ok(file.includes("public bool? Active { get; set; }"));
        });
        it("treats optional properties as nullable", async () => {
            const results = await emit(`
        namespace Demo;
        model Thing { id: string; nickname?: string; count?: int32; }
      `);
            const file = results["Thing.cs"];
            ok(file.includes("public string? Id { get; set; }"));
            ok(file.includes("public string? Nickname { get; set; }"));
            ok(file.includes("public int? Count { get; set; }"));
        });
        it("maps array and record types", async () => {
            const results = await emit(`
        namespace Demo;
        model Bag { tags: string[]; scores: Record<int32>; }
      `);
            const file = results["Bag.cs"];
            ok(file.includes("public IList<string>? Tags { get; set; }"));
            ok(file.includes("public IDictionary<string, int>? Scores { get; set; }"));
        });
        it("emits enums with numeric values", async () => {
            const results = await emit(`
        namespace Demo;
        enum Color { Red: 1, Green: 2, Blue: 3 }
      `);
            const file = results["Color.cs"];
            ok(file.includes("public enum Color"));
            ok(file.includes("Red = 1"));
            ok(file.includes("Green = 2"));
            ok(file.includes("Blue = 3"));
        });
        it("emits inheritance via extends", async () => {
            const results = await emit(`
        namespace Demo;
        model Animal { name: string; }
        model Dog extends Animal { breed: string; }
      `);
            const animal = results["Animal.cs"];
            const dog = results["Dog.cs"];
            ok(animal.includes("public partial class Animal"));
            ok(dog.includes("public partial class Dog : Animal"));
        });
        it("treats nullable unions as nullable C# types", async () => {
            const results = await emit(`
        namespace Demo;
        model M { value: string | null; }
      `);
            ok(results["M.cs"].includes("public string? Value { get; set; }"));
        });
        it("maps date and duration scalars", async () => {
            const results = await emit(`
        namespace Demo;
        model M {
          when: utcDateTime;
          date: plainDate;
          time: plainTime;
          dur: duration;
        }
      `);
            const file = results["M.cs"];
            ok(file.includes("public DateTimeOffset? When { get; set; }"));
            ok(file.includes("public DateOnly? Date { get; set; }"));
            ok(file.includes("public TimeOnly? Time { get; set; }"));
            ok(file.includes("public TimeSpan? Dur { get; set; }"));
        });
        it("emits doc comments as XML summary", async () => {
            const results = await emit(`
        namespace Demo;
        @doc("A user of the system")
        model User {
          @doc("Unique id")
          id: string;
        }
      `);
            const file = results["User.cs"];
            ok(file.includes("/// <summary>"));
            ok(file.includes("/// A user of the system"));
            ok(file.includes("/// Unique id"));
        });
        it("ignores standard library types", async () => {
            const results = await emit(`
        namespace Demo;
        model X { v: string; }
      `);
            const files = Object.keys(results).sort();
            strictEqual(files.length, 2);
            strictEqual(files[0], "IX.cs");
            strictEqual(files[1], "X.cs");
        });
    });
    describe("using statements", () => {
        it("does not add a using for the model's own namespace", async () => {
            const results = await emit(`
        namespace Demo;
        model A { id: string; }
        model B { ref: A; }
      `);
            const file = results["B.cs"];
            ok(!file.includes("using Demo;"), `unexpected self-using in:\n${file}`);
            ok(file.includes("public A? Ref { get; set; }"));
        });
        it("adds a using for a referenced type in another namespace", async () => {
            const results = await emit(`
        namespace App.Common { model Address { city: string; } }
        namespace App.Users { model User { home: App.Common.Address; } }
      `);
            const file = results["User.cs"];
            ok(file.includes("namespace App.Users"));
            ok(file.includes("using App.Common;"), `expected using App.Common; in:\n${file}`);
            ok(file.includes("public Address? Home { get; set; }"));
        });
        it("adds usings for referenced array element and record value types", async () => {
            const results = await emit(`
        namespace App.Common { model Tag { name: string; } }
        namespace App.Users {
          model User {
            tags: App.Common.Tag[];
            scoresByTag: Record<App.Common.Tag>;
          }
        }
      `);
            const file = results["User.cs"];
            ok(file.includes("using App.Common;"));
            ok(file.includes("public IList<Tag>? Tags { get; set; }"));
            ok(file.includes("public IDictionary<string, Tag>? ScoresByTag { get; set; }"));
        });
        it("adds a using for a base model in another namespace", async () => {
            const results = await emit(`
        namespace App.Base { model Entity { id: string; } }
        namespace App.Users { model User extends App.Base.Entity { name: string; } }
      `);
            const file = results["User.cs"];
            ok(file.includes("using App.Base;"));
            ok(file.includes("public partial class User : Entity"));
        });
    });
    describe("namespace-map option", () => {
        it("rewrites the C# namespace for a model in a mapped namespace", async () => {
            const results = await emit(`
          namespace Foo.Bar;
          model Widget { id: string; }
        `, { "namespace-map": { "Foo.Bar": "Acme.Things" } });
            const file = results["Widget.cs"];
            ok(file, `expected Widget.cs, got ${Object.keys(results).join(", ")}`);
            ok(file.includes("namespace Acme.Things"), `wrong namespace in:\n${file}`);
        });
        it("applies the mapping as a prefix replacement to nested namespaces", async () => {
            const results = await emit(`
          namespace Foo.Bar.Sub;
          model Widget { id: string; }
        `, { "namespace-map": { "Foo.Bar": "Acme.Things" } });
            const file = results["Widget.cs"];
            ok(file.includes("namespace Acme.Things.Sub"), `wrong namespace in:\n${file}`);
        });
        it("uses the longest matching key when multiple mappings could apply", async () => {
            const results = await emit(`
          namespace Foo.Bar.Sub;
          model Widget { id: string; }
        `, {
                "namespace-map": {
                    Foo: "Acme",
                    "Foo.Bar": "Acme.Things",
                },
            });
            const file = results["Widget.cs"];
            ok(file.includes("namespace Acme.Things.Sub"));
        });
        it("emits using statements that reflect the mapped namespace of referenced types", async () => {
            const results = await emit(`
          namespace Legacy.Common { model Address { city: string; } }
          namespace App.Users { model User { home: Legacy.Common.Address; } }
        `, { "namespace-map": { "Legacy.Common": "Acme.Common" } });
            const file = results["User.cs"];
            ok(file.includes("namespace App.Users"));
            ok(file.includes("using Acme.Common;"), `expected mapped using Acme.Common; in:\n${file}`);
            ok(!file.includes("using Legacy.Common;"));
            ok(file.includes("public Address? Home { get; set; }"));
        });
        it("places mapped models in folders that match the mapped C# namespace under the root", async () => {
            const results = await emit(`
          namespace Legacy.Common;
          model Address { city: string; }
        `, {
                "root-namespace": "Acme",
                "namespace-map": { "Legacy.Common": "Acme.Common" },
            });
            const file = results["Common/Address.cs"];
            ok(file, `expected Common/Address.cs, got ${Object.keys(results).join(", ")}`);
            ok(file.includes("namespace Acme.Common"));
        });
        it("does not add a using when the mapped namespace equals the consumer's namespace", async () => {
            const results = await emit(`
          namespace Legacy.Common { model Address { city: string; } }
          namespace App.Users { model User { home: Legacy.Common.Address; } }
        `, { "namespace-map": { "Legacy.Common": "App.Users" } });
            const file = results["User.cs"];
            ok(!file.includes("using App.Users;"), `unexpected self-using in:\n${file}`);
            ok(file.includes("public Address? Home { get; set; }"));
        });
    });
    describe("interface generation", () => {
        it("emits a corresponding I<Model> interface alongside each class", async () => {
            const results = await emit(`
        namespace Demo;
        model User { id: string; name: string; }
      `);
            const cls = results["User.cs"];
            const iface = results["IUser.cs"];
            ok(cls, "expected User.cs");
            ok(iface, "expected IUser.cs");
            ok(cls.includes("public partial class User : IUser"));
            ok(cls.includes("public string? Id { get; set; }"));
            ok(iface.includes("public partial interface IUser"));
            ok(iface.includes("string? Id { get; set; }"));
            ok(iface.includes("string? Name { get; set; }"));
            ok(!iface.includes("public string"), "interface members should not have access modifiers");
        });
        it("includes the interface alongside the base class on extends", async () => {
            const results = await emit(`
        namespace Demo;
        model Animal { name: string; }
        model Dog extends Animal { breed: string; }
      `);
            const dogClass = results["Dog.cs"];
            const dogIface = results["IDog.cs"];
            ok(dogClass.includes("public partial class Dog : Animal, IDog"));
            ok(dogIface.includes("public partial interface IDog : IAnimal"));
            ok(dogIface.includes("string? Breed { get; set; }"));
        });
        it("does not generate interfaces for enums", async () => {
            const results = await emit(`
        namespace Demo;
        enum Color { Red, Green, Blue }
      `);
            ok(results["Color.cs"]);
            ok(!results["IColor.cs"], "enums should not have interfaces");
        });
        it("preserves nullable formatting on interface members", async () => {
            const results = await emit(`
        namespace Demo;
        model M { @format("uuid") id?: string; nick?: string; }
      `);
            const iface = results["IM.cs"];
            ok(iface.includes("Guid? Id { get; set; }"));
            ok(iface.includes("string? Nick { get; set; }"));
        });
    });
    describe("models-output-dir / interfaces-output-dir", () => {
        it("routes class files into models-output-dir", async () => {
            const results = await emit(`
          namespace Demo;
          model User { id: string; }
        `, { "models-output-dir": "models" });
            ok(results["models/User.cs"], `expected models/User.cs, got ${Object.keys(results).join(", ")}`);
            ok(results["IUser.cs"], "interface should still be at default emitter-output-dir");
            ok(!results["User.cs"], "class should not be at default location when override is set");
        });
        it("routes interface files into interfaces-output-dir", async () => {
            const results = await emit(`
          namespace Demo;
          model User { id: string; }
        `, { "interfaces-output-dir": "interfaces" });
            ok(results["User.cs"], "class should still be at default emitter-output-dir");
            ok(results["interfaces/IUser.cs"]);
            ok(!results["IUser.cs"], "interface should not be at default location when override is set");
        });
        it("routes both when both overrides are provided", async () => {
            const results = await emit(`
          namespace Demo;
          model User { id: string; }
        `, {
                "models-output-dir": "src/models",
                "interfaces-output-dir": "src/interfaces",
            });
            ok(results["src/models/User.cs"]);
            ok(results["src/interfaces/IUser.cs"]);
        });
        it("respects root-namespace folder layout under each override dir", async () => {
            const results = await emit(`
          namespace App.Users;
          model User { id: string; }
        `, {
                "root-namespace": "App",
                "models-output-dir": "models",
                "interfaces-output-dir": "interfaces",
            });
            ok(results["models/Users/User.cs"]);
            ok(results["interfaces/Users/IUser.cs"]);
        });
        it("routes enums to models-output-dir", async () => {
            const results = await emit(`
          namespace Demo;
          enum Color { Red, Green }
        `, { "models-output-dir": "models" });
            ok(results["models/Color.cs"]);
            ok(!results["Color.cs"]);
        });
    });
    describe("additional-usings option", () => {
        it("appends configured usings to every emitted file", async () => {
            const results = await emit(`
          namespace Demo;
          model User { id: string; }
          enum Color { Red, Green }
        `, { "additional-usings": ["System.Text.Json", "Newtonsoft.Json"] });
            for (const key of ["User.cs", "IUser.cs", "Color.cs"]) {
                const file = results[key];
                ok(file, `expected ${key}`);
                ok(file.includes("using System.Text.Json;"), `missing System.Text.Json in ${key}`);
                ok(file.includes("using Newtonsoft.Json;"), `missing Newtonsoft.Json in ${key}`);
            }
        });
        it("places System namespaces before non-System ones", async () => {
            const results = await emit(`
          namespace Demo;
          model User { id: string; }
        `, { "additional-usings": ["Newtonsoft.Json", "System.Text.Json"] });
            const file = results["User.cs"];
            const sysIdx = file.indexOf("using System;");
            const sysJsonIdx = file.indexOf("using System.Text.Json;");
            const newtonIdx = file.indexOf("using Newtonsoft.Json;");
            ok(sysIdx >= 0 && sysJsonIdx >= 0 && newtonIdx >= 0);
            ok(sysIdx < newtonIdx, "System should come before Newtonsoft");
            ok(sysJsonIdx < newtonIdx, "System.Text.Json should come before Newtonsoft");
        });
        it("does not duplicate a using already implied by a cross-namespace reference", async () => {
            const results = await emit(`
          namespace App.Common { model Address { city: string; } }
          namespace App.Users { model User { home: App.Common.Address; } }
        `, { "additional-usings": ["App.Common"] });
            const file = results["User.cs"];
            const occurrences = file.split("using App.Common;").length - 1;
            strictEqual(occurrences, 1, `expected exactly one 'using App.Common;' in:\n${file}`);
        });
    });
    describe("nullable-properties option", () => {
        it("renders all properties as nullable by default", async () => {
            const results = await emit(`
        namespace Demo;
        model M {
          name: string;
          age: int32;
          tags: string[];
        }
      `);
            const cls = results["M.cs"];
            ok(cls.includes("public string? Name { get; set; }"));
            ok(cls.includes("public int? Age { get; set; }"));
            ok(cls.includes("public IList<string>? Tags { get; set; }"));
            const iface = results["IM.cs"];
            ok(iface.includes("string? Name { get; set; }"));
            ok(iface.includes("int? Age { get; set; }"));
            ok(iface.includes("IList<string>? Tags { get; set; }"));
        });
        it("only marks optional properties as nullable when disabled", async () => {
            const results = await emit(`
          namespace Demo;
          model M {
            id: string;
            nickname?: string;
            count: int32;
            score?: int32;
          }
        `, { "nullable-properties": false });
            const cls = results["M.cs"];
            ok(cls.includes("public string Id { get; set; }"));
            ok(cls.includes("public string? Nickname { get; set; }"));
            ok(cls.includes("public int Count { get; set; }"));
            ok(cls.includes("public int? Score { get; set; }"));
            const iface = results["IM.cs"];
            ok(iface.includes("string Id { get; set; }"));
            ok(iface.includes("string? Nickname { get; set; }"));
            ok(iface.includes("int Count { get; set; }"));
            ok(iface.includes("int? Score { get; set; }"));
        });
        it("still treats null-union properties as nullable when disabled", async () => {
            const results = await emit(`
          namespace Demo;
          model M { value: string | null; required: string; }
        `, { "nullable-properties": false });
            const cls = results["M.cs"];
            ok(cls.includes("public string? Value { get; set; }"));
            ok(cls.includes("public string Required { get; set; }"));
        });
        it("does not double up the nullability marker on already-nullable types", async () => {
            const results = await emit(`
        namespace Demo;
        model M { value: string | null; }
      `);
            const cls = results["M.cs"];
            ok(cls.includes("public string? Value { get; set; }"));
            ok(!cls.includes("string??"));
        });
    });
    describe("templates option", () => {
        it("uses a custom class template when provided", async () => {
            const tpl = writeTemplate("class", `[Serializable]
public partial class {{className}} : {{bases}}
{
{{#each properties}}    public {{type}} {{name}} { get; set; }
{{/each}}
}`);
            const results = await emit(`
          namespace Demo;
          model User { id: string; name: string; }
        `, { templates: { class: tpl } });
            const cls = results["User.cs"];
            ok(cls.includes("[Serializable]"), `expected [Serializable] in:\n${cls}`);
            ok(cls.includes("public partial class User : IUser"));
            ok(cls.includes("public string? Id { get; set; }"));
            ok(cls.includes("public string? Name { get; set; }"));
            ok(results["IUser.cs"].includes("public partial interface IUser"));
        });
        it("uses a custom interface template when provided", async () => {
            const tpl = writeTemplate("interface", `public partial interface {{interfaceName}}{{baseClause}}
{
{{#each properties}}    {{type}} {{name}} { get; }
{{/each}}
}`);
            const results = await emit(`
          namespace Demo;
          model User { id: string; }
        `, { templates: { interface: tpl } });
            const iface = results["IUser.cs"];
            ok(iface.includes("public partial interface IUser"));
            ok(iface.includes("string? Id { get; }"), `expected get-only prop in:\n${iface}`);
            ok(!iface.includes("set;"), `interface should not contain setters in:\n${iface}`);
        });
        it("uses a custom enum template when provided", async () => {
            const tpl = writeTemplate("enum", `[Flags]
public enum {{enumName}}
{
{{#each members}}    {{name}}{{#if value}} = {{value}}{{/if}},
{{/each}}
}`);
            const results = await emit(`
          namespace Demo;
          enum Color { Red: 1, Green: 2, Blue: 3 }
        `, { templates: { enum: tpl } });
            const file = results["Color.cs"];
            ok(file.includes("[Flags]"), `expected [Flags] in:\n${file}`);
            ok(file.includes("Red = 1,"));
            ok(file.includes("Blue = 3,"));
        });
        it("uses a custom file template when provided", async () => {
            const tpl = writeTemplate("file", `// CUSTOM HEADER
namespace {{namespace}}
{
{{indent body}}
}`);
            const results = await emit(`
          namespace Demo;
          model User { id: string; }
        `, { templates: { file: tpl } });
            const file = results["User.cs"];
            ok(file.startsWith("// CUSTOM HEADER"), `expected custom header in:\n${file}`);
            ok(!file.includes("// <auto-generated/>"));
            ok(file.includes("namespace Demo"));
            ok(file.includes("public partial class User"));
        });
        it("falls back to defaults for templates that are not overridden", async () => {
            const tpl = writeTemplate("class", `public sealed class {{className}} : {{bases}}
{
{{indent propertiesBlock}}
}`);
            const results = await emit(`
          namespace Demo;
          model User { id: string; }
        `, { templates: { class: tpl } });
            ok(results["User.cs"].includes("public sealed class User"));
            ok(results["IUser.cs"].includes("public partial interface IUser"));
        });
        it("reports a diagnostic when a custom template cannot be loaded", async () => {
            const [, diagnostics] = await emitWithDiagnostics(`
          namespace Demo;
          model User { id: string; }
        `, { templates: { class: "/no/such/file/class.hbs" } });
            const failure = diagnostics.find((d) => d.code === "@mlafleur/csharp-api-models/template-load-failed");
            ok(failure, `expected template-load-failed diagnostic, got: ${JSON.stringify(diagnostics)}`);
            ok(failure.message.includes("class"), `diagnostic should name template: ${failure.message}`);
        });
    });
});
