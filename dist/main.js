"use strict";
const query = `
  query export($exportId: ID!) {
    export(exportId: $exportId) {
      id
      data
    }
  }
`;
const shortenName = (name) => {
    return name.split(" ").map((x) => x.substring(0, 3)).join("");
};
const byId = (needle) => (item) => item.flags?.yamiat?.entity === needle.flags?.yamiat?.entity;
const importData = async (data) => {
    const g = game;
    const journalUpdates = data.journals.map(async (journal) => {
        // @ts-ignore
        const existingJournal = g.journal?.find(byId(journal));
        if (existingJournal) {
            console.log("Yamiat Companion: Journal already exists", journal, existingJournal);
            return;
        }
        console.log("Yamiat Companion: Importing journal", journal);
        const newJournal = await JournalEntry.create({
            name: journal.name,
            pages: journal.pages,
            img: journal.img,
            flags: journal.flags,
        });
        console.log("Yamiat Companion: Journal created", newJournal);
    });
    await Promise.all(journalUpdates);
    const sceneUpdates = data.scenes.map(async (scene) => {
        if (g.scenes?.find(byId(scene))) {
            console.log("Yamiat Companion: Scene already exists", scene);
            return;
        }
        console.log("Yamiat Companion: Importing scene", scene);
        const journal = g.journal?.find(byId(scene));
        console.log("Yamiat Companion: Found journal", journal);
        const img = new Image();
        img.src = scene.img;
        img.onload = async () => {
            const [x] = scene.grid;
            const newScene = await Scene.create({
                name: scene.name,
                img: scene.img,
                width: img.width,
                height: img.height,
                grid: img.width / x,
                flags: scene.flags,
                journal: journal?.id,
            });
            console.log("Yamiat Companion: Scene created", newScene);
        };
    });
    await Promise.all(sceneUpdates);
    const actorUpdates = data.actors.map(async (actor) => {
        if (g.actors?.find(byId(actor))) {
            console.log("Yamiat Companion: Actor already exists", actor);
            return;
        }
        console.log("Yamiat Companion: Importing actor", actor);
        const newActor = await Actor.create({
            name: actor.name,
            img: actor.img,
            type: actor.type,
            system: actor.system,
            flags: actor.flags,
        });
        console.log("Yamiat Companion: Actor created", newActor);
    });
    await Promise.all(actorUpdates);
};
const fetchExport = async (exportId) => {
    const g = game;
    const token = g.settings.get("yamiat-companion", "apiToken");
    const url = g.settings.get("yamiat-companion", "apiUrl");
    return foundry.utils.fetchJsonWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': token,
        },
        body: JSON.stringify({
            query,
            variables: {
                exportId,
            },
        }),
    });
};
Hooks.once("init", () => {
    console.log(`Yamiat Companion init`);
    const g = game;
    g.settings.register("yamiat-companion", "apiUrl", {
        name: "API Url ID",
        config: true,
        default: '<api-url>'
    });
    g.settings.register("yamiat-companion", "apiToken", {
        name: "API Token",
        config: true,
        default: '<api-token>'
    });
});
Hooks.once("ready", () => {
    console.log(`Yamiat Companion ready`);
});
const getCollection = async (name, label, type) => {
    const g = game;
    // @ts-ignore
    const collection = await g.packs.get(`world.${name}`) ?? await CompendiumCollection.createCompendium({
        name,
        label,
        type,
    });
    // @ts-ignore
    return collection;
};
const d = new Dialog({
    title: "Import from yamiat",
    content: "<p>Export ID: <input type='text' id='exportId' /></p>",
    buttons: {
        one: {
            icon: '<i class="fas fa-check"></i>',
            label: "Import",
            callback: async (html) => {
                const g = game;
                const exportId = $(html).find('#exportId').val();
                const response = await fetchExport(exportId);
                const data = JSON.parse(response.data.export.data);
                console.log("Yamiat Companion: ", data);
                const { sources } = data;
                await Promise.all(sources.map(async (source) => {
                    if (source.name === "5E SRD") {
                        return Promise.resolve();
                    }
                    const items = await getCollection(`yamiat-${source.id}-items`, `${shortenName(source.name)} Items`, "Item");
                    const actors = await getCollection(`yamiat-${source.id}-actors`, `${shortenName(source.name)} Actors`, "Actor");
                    const scenes = await getCollection(`yamiat-${source.id}-scenes`, `${shortenName(source.name)} Scenes`, "Scene");
                    const journals = await getCollection(`yamiat-${source.id}-journals`, `${shortenName(source.name)} Journals`, "JournalEntry");
                }));
                await Promise.all(data.items.map(async (item) => {
                    const itemsPath = `world.yamiat-${item.flags.yamiat.source}-items`;
                    const existingItem = g.packs?.get(itemsPath)?.find(byId(item));
                    if (existingItem) {
                        console.log("Yamiat Companion: Item already exists, updating", item);
                        await existingItem.update(item);
                    }
                    else {
                        console.log("Yamiat Companion: Item does not exist, creating", item);
                        await Item.create(item, {
                            pack: itemsPath
                        });
                    }
                }));
                await Promise.all(data.actors.map(async (actor) => {
                    const actorsPath = `world.yamiat-${actor.flags.yamiat.source}-actors`;
                    const existingActor = g.packs?.get(actorsPath)?.find(byId(actor));
                    if (existingActor) {
                        console.log("Yamiat Companion: Actor already exists, updating", actor);
                        await existingActor.update(actor);
                    }
                    else {
                        console.log("Yamiat Companion: Actor does not exist, creating", actor);
                        await Actor.create(actor, {
                            pack: actorsPath
                        });
                    }
                }));
                await Promise.all(data.scenes.map(async (scene) => {
                    const scenesPath = `world.yamiat-${scene.flags.yamiat.source}-scenes`;
                    const existingScene = g.packs?.get(scenesPath)?.find(byId(scene));
                    if (existingScene) {
                        console.log("Yamiat Companion: Scene already exists, updating", scene);
                        await existingScene.update(scene);
                    }
                    else {
                        console.log("Yamiat Companion: Scene does not exist, creating", scene);
                        await Scene.create(scene, {
                            pack: scenesPath
                        });
                    }
                }));
                await Promise.all(data.journals.map(async (journal) => {
                    const journalsPath = `world.yamiat-${journal.flags.yamiat.source}-journals`;
                    const existingJournal = g.packs?.get(journalsPath)?.find(byId(journal));
                    if (existingJournal) {
                        console.log("Yamiat Companion: Journal already exists, updating", journal);
                        await existingJournal.update(journal);
                    }
                    else {
                        console.log("Yamiat Companion: Journal does not exist, creating", journal);
                        await JournalEntry.create(journal, {
                            pack: journalsPath
                        });
                    }
                }));
            }
        },
    },
    default: "two",
    render: html => console.log("Register interactivity in the rendered dialog"),
    close: html => console.log("This always is logged no matter which option is chosen")
});
Hooks.on("getSceneControlButtons", (controls, b, c) => {
    console.log("Yamiat Companion: getSceneControlButtons", controls);
    controls?.find((x) => x.name == "token")?.tools.push({
        active: false,
        icon: "fas fa-download",
        name: "door",
        title: "SYNC",
        onClick: async function () {
            d.render(true);
            // console.log("fetching export");
            // const response = await fetchExport() as any;
            // const data = JSON.parse(response.data.export.data) as ExportData;
            // // await importData(data);
            // console.log("Yamiat Companion: ", data);
        },
    });
});
const getSelectedActors = () => canvas?.tokens?.controlled?.map((x) => x.actor) || [];
const addEvent = (event) => {
    const oldEvents = JSON.parse(localStorage.getItem("yamiat.companion.events") || "[]");
    localStorage.setItem("yamiat.companion.events", JSON.stringify([...oldEvents, event]));
};
Hooks.on("createActor", (document, change, options, userId) => {
    console.log({ document, change, options, userId });
});
Hooks.on("updateActor", (document, change, options, userId) => {
    console.log({ document, change, options, userId });
    addEvent({ date: new Date().toTimeString(), type: "updateActor", document, change, options, userId });
});
Hooks.on("createItem", (document, change, options, userId) => {
    console.log({ document, change, options, userId });
});
Hooks.on("updateItem", (document, change, options, userId) => {
    console.log({ document, change, options, userId });
    addEvent({ date: new Date().toTimeString(), type: "updateItem", document, change, options, userId });
});
Hooks.on('targetToken', async (item, options) => { });
// dnd5e hooks
Hooks.on('dnd5e.preRollAttack', async (item, options) => { });
Hooks.on('dnd5e.rollAttack', async (item, roll) => {
    console.log("Yamiat Companion: rollAttack", item, roll);
});
Hooks.on('dnd5e.preRollDamage', async (item, actor) => { });
Hooks.on('dnd5e.rollDamage', async (item, roll) => {
    console.log("Yamiat Companion: rollDamage", item, roll);
});
Hooks.on('updateActor', async (actor, doc) => {
    console.log("Yamiat Companion: updateActor", actor, doc);
});
Hooks.on('updateToken', async (token, pos) => {
    console.log("Yamiat Companion: updateToken", token, pos);
});
Hooks.on('dnd5e.useItem', async () => { });
Hooks.on('dnd5e.itemUsageConsumption', async (item, config, options, usage) => {
    const parent = item.parent;
    if (parent.flags.yamiat?.entity) {
        const qty = usage.itemUpdates["system.quantity"];
        console.log(`Yamiat Companion: ${parent.name} is a yamiat entity and consumed ${item.name}. Leaving ${qty} remaining.`);
    }
});
Hooks.on('modifyTokenAttribute', async (item) => { });
