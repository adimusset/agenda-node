import moment from "moment";
import knex from "../knexClient.js";

// {
//   kind: 'opening',
//   starts_at: new Date('2014-08-04 09:30'),
//   ends_at: new Date('2014-08-04 12:30'),
//   weekly_recurring: true,
// },
// {
//   kind: 'appointment',
//   starts_at: new Date('2014-08-11 10:30'),
//   ends_at: new Date('2014-08-11 11:30'),
// }

// {
//   date: new Date('2014-08-11'),
//   slots: [
//     '9:30',
//     '10:00',
//     '11:30',
//     '12:00',
//   ]
// }

export default async function getAvailabilities(date) {
    const allEvents = await fetchEvents(date);
    return availabilitiesFromEvents(allEvents, date);
}

async function fetchEvents(date) {
    // all appointments next week
    const appointments = await knex
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
    const recurringOpenings = await knex
        .select("kind", "starts_at", "ends_at", "weekly_recurring")
        .from("events")
        .where({
            kind: "opening",
            weekly_recurring: true
        });
    // all non recurring openings next week
    const nonRecurringOpenings = await knex
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
    return { appointments, recurringOpenings, nonRecurringOpenings };
}

// computes availabilities from events coming from fetchEvents
const availabilitiesFromEvents = (
    { appointments, recurringOpenings, nonRecurringOpenings },
    date
) => {
    // rearrange data by day
    const openingsByDay = new Map();
    recurringOpenings.forEach(recurring => {
        for (
            let opening = moment(date)
                .hour(moment(recurring.starts_at).hour())
                .minute(moment(recurring.starts_at).minute());
            opening.isBefore(moment(date).add(7, "days"));
            opening.add(1, "day")
        ) {
            // weekly openings are skipped on sundays
            if (opening.day() === 0) {
                continue;
            }
            store(openingsByDay, {
                kind: "opening",
                starts_at: opening.toDate(),
                ends_at: opening
                    .hour(moment(recurring.ends_at).hour())
                    .minute(moment(recurring.ends_at).minute())
                    .toDate(),
                weekly_recurring: true
            });
        }
    });
    nonRecurringOpenings.forEach(opening => {
        store(openingByDay, opening);
    });
    const appointmentsByDay = new Map();
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
        let slots = new Set();
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

// store an event in a map keyed by day
const store = (map, event) => {
    const day = moment(event.starts_at).format("YYYY-MM-DD");
    let retrieved = map.get(day) || [];
    retrieved.push(event);
    map.set(day, retrieved);
};

export { fetchEvents, availabilitiesFromEvents };
