import moment from "moment";
import knex from "../knexClient.js";

// get availabilities for next 7 days
export default async function getAvailabilities(date) {
    const allEvents = await fetchEvents(date);
    return availabilitiesFromEvents(allEvents, date);
}

// concurently fetch appointments and openings
async function fetchEvents(date) {
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
    return await Promise.all([
        appointments,
        recurringOpenings,
        nonRecurringOpenings
    ]).then(fetchedEvents => {
        return {
            appointments: fetchedEvents[0],
            recurringOpenings: fetchedEvents[1],
            nonRecurringOpenings: fetchedEvents[2]
        };
    });
}

// computes availabilities from events coming from fetchEvents
const availabilitiesFromEvents = (
    { appointments, recurringOpenings, nonRecurringOpenings },
    date
) => {
    // rearrange data by day
    const openingsByDay = new Map();
    const appointmentsByDay = new Map();

    recurringOpenings.forEach(recurring => {
        for (
            let start = moment(date)
                .hour(moment(recurring.starts_at).hour())
                .minute(moment(recurring.starts_at).minute());
            start.isBefore(moment(date).add(7, "days"));
            start.add(1, "day")
        ) {
            // weekly openings are skipped on sundays
            if (start.day() === 0) {
                continue;
            }
            const end = start
                .clone()
                .hours(moment(recurring.ends_at).hour())
                .minutes(moment(recurring.ends_at).minute());

            store(openingsByDay, {
                kind: "opening",
                starts_at: start.toDate(),
                ends_at: end.toDate(),
                weekly_recurring: true
            });
        }
    });
    nonRecurringOpenings.forEach(opening => {
        store(openingsByDay, opening);
    });

    appointments.forEach(appointment => {
        store(appointmentsByDay, appointment);
    });

    // compute availabilities for each day
    let output = [];
    for (
        let opening = moment(date).hour(moment);
        opening.isBefore(moment(date).add(7, "days"));
        opening.add(1, "day")
    ) {
        const day = opening.format("YYYY-MM-DD");
        const openings = openingsByDay.get(day) || [];
        // compute set of unique availabilities this day from openings
        const slots = new Set();
        openings.forEach(opening => {
            for (
                let availability = moment(opening.starts_at);
                availability.isBefore(opening.ends_at);
                availability.add(30, "minutes")
            ) {
                const slot = availability.format("H:mm");
                slots.add(slot);
            }
        });
        // remove availabilities no longer available from appointments
        let retrievedAppointments = appointmentsByDay.get(day) || [];
        retrievedAppointments.forEach(appointement => {
            for (
                let availability = moment(appointement.starts_at);
                availability.isBefore(appointement.ends_at);
                availability.add(30, "minutes")
            ) {
                const slot = moment(availability).format("H:mm");
                slots.delete(slot);
            }
        });
        // save computed availabilities
        output.push({
            date: new Date(day),
            slots: Array.from(slots).sort((a, b) =>
                moment(a, "H:mm").diff(moment(b, "H:mm"))
            )
        });
    }
    return output;
};

// store an event by day
const store = (map, event) => {
    const day = moment(event.starts_at).format("YYYY-MM-DD");
    let retrieved = map.get(day) || [];
    retrieved.push(event);
    map.set(day, retrieved);
};

export { fetchEvents, availabilitiesFromEvents };
