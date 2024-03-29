import { Request, Response } from "express";
import db from "../../database/conn";
import convertHourToMinutes from "../../utils/convertHourToMinutes";

interface scheduleItem {
  week_day: number;
  from: string;
  to: string;
}

class ClassesController {
  async index(req: Request, res: Response) {
    const filters = req.query;

    const week_day = filters.week_day as string;
    const subject = filters.subject as string;
    const time = filters.time as string;

    if (!filters.week_day || !filters.subject || !filters.time) {
      return res.status(400).json({
        error: "Missing filters!",
      });
    }

    const timeInMinutes = convertHourToMinutes(time);
    const classes = await db("classes")
      .whereExists(function () {
        this.select("class_schedule.*")
          .from("class_schedule")
          .whereRaw("`class_schedule`.`class_id` = `classes`.`id`")
          .whereRaw("`class_schedule`.`week_day` = ??", [Number(week_day)])
          .whereRaw("`class_schedule`.`from` <= ??", [timeInMinutes])
          .whereRaw("`class_schedule`.`to` > ??", [timeInMinutes]);
      })
      .where("classes.subject", "=", subject)
      .join("users", "classes.user_id", "=", "users.id")
      .select(["classes.*", "users.*"]);

    return res.json(classes);
  }
  async create(req: Request, res: Response) {
    const { name, avatar, whatsapp, bio, subject, cost, schedule } = req.body;

    const trx = await db.transaction(); // TIP transactions

    try {
      const insertedUsersIds = await trx("users").insert({
        name,
        avatar,
        whatsapp,
        bio,
      });

      const user_id = insertedUsersIds[0];

      const insertedClassesIDs = await trx("classes").insert({
        subject,
        cost,
        user_id,
      });

      const class_id = insertedClassesIDs[0];

      const classSchedule = schedule.map((scheduleItem: scheduleItem) => {
        return {
          week_day: scheduleItem.week_day,
          from: convertHourToMinutes(scheduleItem.from),
          to: convertHourToMinutes(scheduleItem.to),
          class_id,
        };
      });

      await trx("class_schedule").insert(classSchedule);

      await trx.commit();

      return res
        .status(201)
        .send({ insertedUsersIds, insertedClassesIDs, classSchedule });
    } catch (err) {
      await trx.rollback();
      return res.status(400).json(err);
    }
  }
}

export default new ClassesController();
