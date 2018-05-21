import knex from "../knexClient.js";

const getAppointments = (date, lastDay) =>
    knex
        .select("kind", "starts_at", "ends_at")
        .from("events")
        .whereBetween("starts_at", [date, lastDay])
        .andWhere("kind", "appointment");

const getRecurringOpenings = lastDay =>
    knex
        .select("kind", "starts_at", "ends_at", "weekly_recurring")
        .from("events")
        .whereRaw("starts_at < ?", lastDay)
        .andWhere({
            kind: "opening",
            weekly_recurring: true
        });

const getNonRecurringOpenings = (date, lastDay) =>
    knex
        .select("kind", "starts_at", "ends_at", "weekly_recurring")
        .from("events")
        .whereBetween("starts_at", [date, lastDay])
        .where({
            kind: "opening",
            weekly_recurring: false
        });

export { getAppointments, getRecurringOpenings, getNonRecurringOpenings };
