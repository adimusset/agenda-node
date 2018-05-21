import moment from "moment";
import {
    getAppointments,
    getRecurringOpenings,
    getNonRecurringOpenings
} from "./datalayer.js";

// get availabilities for following 7 days
export default async function getAvailabilities(date) {
    const allEvents = await fetchEvents(date);
    return availabilitiesFromEvents(allEvents, date);
}

// concurently fetch appointments and openings
const fetchEvents = async date => {
    const lastDay = moment(date)
        .add(1, "week")
        .toDate();
    // all appointments next week
    const appointments = getAppointments(date, lastDay);
    // all weekly recurring openings before the end of next week
    const recurringOpenings = getRecurringOpenings(lastDay);
    // all non recurring openings next week
    const nonRecurringOpenings = getNonRecurringOpenings(date, lastDay);

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

    // add slots from recurring openings before end of next week
    computeRecurringOpenings(recurringOpenings, slotsByDay, date);

    // add slots from non recurring openings happening next week
    computeNonRecurringOpenings(nonRecurringOpenings, slotsByDay);

    // remove slots already taken by appointments next week
    computeAppointments(appointments, slotsByDay);

    // format data
    return formatOutput(slotsByDay, date);
};

export { fetchEvents, availabilitiesFromEvents };

const computeRecurringOpenings = (recurringOpenings, slotsByDay, date) => {
    recurringOpenings.forEach(recurring => {
        // compute recurring slots
        const slots = new Set();
        storeSlots(slots, recurring.starts_at, recurring.ends_at);

        // compute recurring day next week
        const startDayOfWeek = moment(date).day();
        const recurringDayOfWeek = moment(recurring.starts_at).day();
        const day = moment(date);
        if (startDayOfWeek <= recurringDayOfWeek) {
            day.day(recurringDayOfWeek);
        } else {
            day.day(recurringDayOfWeek + 7);
        }
        slotsByDay.set(day.format("YYYY-MM-DD"), new Set(slots));
    });
};

const computeNonRecurringOpenings = (nonRecurringOpenings, slotsByDay) => {
    nonRecurringOpenings.forEach(opening => {
        const day = moment(opening.starts_at).format("YYYY-MM-DD");
        const slots = slotsByDay.get(day) || new Set();
        storeSlots(slots, opening.starts_at, opening.ends_at);
        slotsByDay.set(day, slots);
    });
};

const storeSlots = (set, start, end) => {
    for (
        let availability = moment(start);
        availability.isBefore(moment(end));
        availability.add(30, "minutes")
    ) {
        set.add(availability.format("H:mm"));
    }
};

const computeAppointments = (appointments, slotsByDay) => {
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
};

const formatOutput = (slotsByDay, date) => {
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
