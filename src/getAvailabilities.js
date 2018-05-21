import moment from "moment";
import knex from "../knexClient.js";

// get availabilities for following 7 days
export default async function getAvailabilities(date) {
    const allEvents = await fetchEvents(date);
    return availabilitiesFromEvents(allEvents, date);
}

// concurently fetch appointments and openings
const fetchEvents = async date => {
    // all appointments next week
    const appointments = knex
        .select("kind", "starts_at", "ends_at")
        .from("events")
        .whereBetween("starts_at", [
            date,
            moment(date)
                .add(1, "week")
                .toDate()
        ])
        .andWhere("kind", "appointment");
    // all weekly recurring openings
    const recurringOpenings = knex
        .select("kind", "starts_at", "ends_at", "weekly_recurring")
        .from("events")
        .where({
            kind: "opening",
            weekly_recurring: true
        });
    // all non recurring openings next week
    const nonRecurringOpenings = knex
        .select("kind", "starts_at", "ends_at", "weekly_recurring")
        .from("events")
        .whereBetween("starts_at", [
            date,
            moment(date)
                .add(1, "week")
                .toDate()
        ])
        .where({
            kind: "opening",
            weekly_recurring: false
        });
    // wait for 3 promises at the same time
    return await Promise.all([
        appointments,
        recurringOpenings,
        nonRecurringOpenings
    ])
        .then(fetchedEvents => {
            return {
                appointments: fetchedEvents[0],
                recurringOpenings: fetchedEvents[1],
                nonRecurringOpenings: fetchedEvents[2]
            };
        })
        .catch(err => {
            console.log(err);
            return {
                appointments: [],
                recurringOpenings: [],
                nonRecurringOpenings: []
            };
        });
};

// computes availabilities from events coming from fetchEvents
const availabilitiesFromEvents = (
    { appointments, recurringOpenings, nonRecurringOpenings },
    date
) => {
    const slotsByDay = new Map();

    // add slots from recurring openings
    recurringOpenings.forEach(recurring => {
        const initialstart = moment(date)
            .hour(moment(recurring.starts_at).hour())
            .minute(moment(recurring.starts_at).minute());
        const initialEnd = moment(date)
            .hours(moment(recurring.ends_at).hour())
            .minutes(moment(recurring.ends_at).minute());
        // compute recurring slots
        const slots = new Set();
        for (
            let availability = moment(initialstart);
            availability.isBefore(moment(initialEnd));
            availability.add(30, "minutes")
        ) {
            slots.add(availability.format("H:mm"));
        }
        for (
            let start = initialstart, end = initialEnd;
            start.isBefore(moment(date).add(7, "days"));
            start.add(1, "day"), end.add(1, "day")
        ) {
            // weekly openings are skipped on sundays
            if (start.day() === 0) {
                continue;
            }

            slotsByDay.set(moment(start).format("YYYY-MM-DD"), new Set(slots));
        }
    });

    // add slots from non recurring openings happening next week
    nonRecurringOpenings.forEach(opening => {
        const day = moment(opening.starts_at).format("YYYY-MM-DD");
        const slots = slotsByDay.get(day) || new Set();
        for (
            let availability = moment(opening.starts_at);
            availability.isBefore(moment(opening.ends_at));
            availability.add(30, "minutes")
        ) {
            slots.add(availability.format("H:mm"));
        }
        slotsByDay.set(day, slots);
    });

    // remove slots already taken by appointments
    appointments.forEach(appointment => {
        const day = moment(appointment.starts_at).format("YYYY-MM-DD");
        const slots = slotsByDay.get(day);
        if (!slots) return;
        for (
            let availability = moment(appointment.starts_at);
            availability.isBefore(moment(appointment.ends_at));
            availability.add(30, "minutes")
        ) {
            const slot = moment(availability).format("H:mm");
            slots.delete(slot);
        }
        slotsByDay.set(day, slots);
    });

    // format data
    let output = [];
    for (
        let opening = moment(date);
        opening.isBefore(moment(date).add(7, "days"));
        opening.add(1, "day")
    ) {
        const day = opening.format("YYYY-MM-DD");
        const slots = slotsByDay.get(day) || new Set();

        output.push({
            date: new Date(day),
            slots: Array.from(slots).sort((a, b) =>
                moment(a, "H:mm").diff(moment(b, "H:mm"))
            )
        });
    }
    return output;
};

export { fetchEvents, availabilitiesFromEvents };
