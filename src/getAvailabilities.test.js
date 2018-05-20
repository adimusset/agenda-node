import knex from "../knexClient.js";
import getAvailabilities, {
    convertWeeklyOpening,
    fetchEvents,
    availabilitiesFromEvents
} from "./getAvailabilities.js";

describe("getAvailabilities", () => {
    beforeEach(() => knex("events").truncate());

    describe("simple case", () => {
        beforeEach(async () => {
            await knex("events").insert([
                {
                    kind: "opening",
                    starts_at: new Date("2014-08-04 09:30"),
                    ends_at: new Date("2014-08-04 12:30"),
                    weekly_recurring: true
                },
                {
                    kind: "appointment",
                    starts_at: new Date("2014-08-11 10:30"),
                    ends_at: new Date("2014-08-11 11:30")
                }
            ]);
        });

        it("should fetch availabilities correctly", async () => {
            const availabilities = await getAvailabilities(
                new Date("2014-08-10")
            );
            expect(availabilities.length).toBe(7);

            expect(String(availabilities[0].date)).toBe(
                String(new Date("2014-08-10"))
            );
            expect(availabilities[0].slots).toEqual([]);

            expect(String(availabilities[1].date)).toBe(
                String(new Date("2014-08-11"))
            );
            expect(availabilities[1].slots).toEqual([
                "9:30",
                "10:00",
                "11:30",
                "12:00"
            ]);

            expect(String(availabilities[6].date)).toBe(
                String(new Date("2014-08-16"))
            );
        });
    });
});

describe("utils", () => {
    it("should fetch data from database correctly", async () => {
        await knex("events").insert([
            {
                kind: "opening",
                starts_at: new Date("2014-08-13 9:30"),
                ends_at: new Date("2014-08-13 20:00"),
                weekly_recurring: false
            }
        ]);
        const allEvents = await fetchEvents(new Date("2014-08-10"));
        expect(allEvents).toEqual({
            appointments: [
                {
                    kind: "appointment",
                    starts_at: Date.parse("2014-08-11 10:30"),
                    ends_at: Date.parse("2014-08-11 11:30")
                }
            ],
            recurringOpenings: [
                {
                    kind: "opening",
                    starts_at: Date.parse("2014-08-04 09:30"),
                    ends_at: Date.parse("2014-08-04 12:30"),
                    weekly_recurring: 1
                }
            ],
            nonRecurringOpenings: [
                {
                    kind: "opening",
                    starts_at: Date.parse("2014-08-13 9:30"),
                    ends_at: Date.parse("2014-08-13 20:00"),
                    weekly_recurring: 0
                }
            ]
        });
    });
    it("should convert events to availabilities correctly", () => {
        const events = {
            appointments: [
                {
                    kind: "appointment",
                    starts_at: Date.parse("2018-05-21 17:30"),
                    ends_at: Date.parse("2018-05-21 18:30")
                },
                {
                    kind: "appointment",
                    starts_at: Date.parse("2018-05-21 11:30"),
                    ends_at: Date.parse("2018-05-21 13:00")
                },
                {
                    kind: "appointment",
                    starts_at: Date.parse("2018-05-22 9:30"),
                    ends_at: Date.parse("2018-05-22 11:00")
                }
            ],
            recurringOpenings: [
                {
                    kind: "opening",
                    starts_at: Date.parse("2018-05-30 21:00"),
                    ends_at: Date.parse("2018-05-30 21:30"),
                    weekly_recurring: 1
                }
            ],
            nonRecurringOpenings: [
                {
                    kind: "opening",
                    starts_at: Date.parse("2018-05-21 9:30"),
                    ends_at: Date.parse("2018-05-21 20:00"),
                    weekly_recurring: 0
                },
                {
                    kind: "opening",
                    starts_at: Date.parse("2018-05-22 09:00"),
                    ends_at: Date.parse("2018-05-22 12:00"),
                    weekly_recurring: 0
                }
            ]
        };
        const availabilities = availabilitiesFromEvents(
            events,
            new Date("2018-05-21")
        );
        expect(availabilities).toEqual([
            {
                date: new Date("2018-05-21"),
                slots: [
                    "9:30",
                    "10:00",
                    "10:30",
                    "11:00",
                    "13:00",
                    "13:30",
                    "14:00",
                    "14:30",
                    "15:00",
                    "15:30",
                    "16:00",
                    "16:30",
                    "17:00",
                    "18:30",
                    "19:00",
                    "19:30",
                    "21:00"
                ]
            },
            {
                date: new Date("2018-05-22"),
                slots: ["9:00", "11:00", "11:30", "21:00"]
            },
            {
                date: new Date("2018-05-23"),
                slots: ["21:00"]
            },
            {
                date: new Date("2018-05-24"),
                slots: ["21:00"]
            },
            {
                date: new Date("2018-05-25"),
                slots: ["21:00"]
            },
            {
                date: new Date("2018-05-26"),
                slots: ["21:00"]
            },
            {
                date: new Date("2018-05-27"),
                slots: []
            }
        ]);
    });
});

describe("invalid data", () => {
    it("should ignore invalid appointement", () => {
        const events = {
            appointments: [
                {
                    kind: "appointment",
                    starts_at: new Date("2018-05-22 17:30"),
                    ends_at: new Date("2018-05-22 18:30")
                }
            ],
            recurringOpenings: [],
            nonRecurringOpenings: [
                {
                    kind: "opening",
                    starts_at: new Date("2018-05-21 9:30"),
                    ends_at: new Date("2018-05-21 20:00"),
                    weekly_recurring: false
                }
            ]
        };
        const availabilities = availabilitiesFromEvents(
            events,
            new Date("2018-05-21")
        );
        expect(availabilities[0].slots.length).toEqual(21);
        expect(availabilities[1].slots.length).toEqual(0);
    });
    it("should ignore overlapping openings", () => {
        const events = {
            appointments: [],
            recurringOpenings: [
                {
                    kind: "opening",
                    starts_at: new Date("2018-05-21 9:00"),
                    ends_at: new Date("2018-05-21 11:00"),
                    weekly_recurring: true
                }
            ],
            nonRecurringOpenings: [
                {
                    kind: "opening",
                    starts_at: new Date("2018-05-21 9:30"),
                    ends_at: new Date("2018-05-21 12:00"),
                    weekly_recurring: false
                }
            ]
        };
        const availabilities = availabilitiesFromEvents(
            events,
            new Date("2018-05-21")
        );
        expect(availabilities[0].slots.length).toEqual(6);
        expect(availabilities[1].slots.length).toEqual(4);
    });
    it("should ignore overlapping appointements", () => {
        const events = {
            appointments: [
                {
                    kind: "appointment",
                    starts_at: new Date("2018-05-21 9:00"),
                    ends_at: new Date("2018-05-21 11:00")
                },
                {
                    kind: "appointment",
                    starts_at: new Date("2018-05-21 10:00"),
                    ends_at: new Date("2018-05-21 11:30")
                }
            ],
            recurringOpenings: [],
            nonRecurringOpenings: [
                {
                    kind: "opening",
                    starts_at: new Date("2018-05-21 9:00"),
                    ends_at: new Date("2018-05-21 12:00"),
                    weekly_recurring: false
                }
            ]
        };
        const availabilities = availabilitiesFromEvents(
            events,
            new Date("2018-05-21")
        );
        expect(availabilities[0].slots.length).toEqual(1);
        expect(availabilities[1].slots.length).toEqual(0);
    });
});
