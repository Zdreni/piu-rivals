import type { AdminTrack, AdminTracksResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { type Kysely, sql } from 'kysely';
import type { Database } from '../../db/schema.ts';
import type { AppDeps } from '../app.ts';
import { requireAdmin } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { IdParams } from './params.ts';


const loadTracks = (db: Kysely<Database>)  =>  db.selectFrom('tracks')
  .select(['id', 'song_key as songKey', 'title', 'short_title as shortTitle']);


export const adminTrackRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db })  => {
  app.addHook('preHandler', requireAdmin);


  app.get('/admin/tracks', async (): Promise<AdminTracksResponse>  =>  ({
    tracks: await loadTracks(db).orderBy('title').execute(),
  }));


  // An empty short title puts the title back. A short title can't be another track's title or short title; the
  // comparison ignores case and accents, as the column's collation does.
  app.patch('/admin/tracks/:id', {
    schema: { params: IdParams, body: Type.Object({ shortTitle: Type.String({ maxLength: 255 }) }) },
  }, async (request): Promise<{ track: AdminTrack }>  => {
    const { id } = request.params;
    const track = await loadTracks(db).where('id', '=', id).executeTakeFirst();
    if (! track)
      throw new HttpError(404, 'Unknown track');

    const shortTitle = request.body.shortTitle.trim()  ||  track.title;
    const clash = await db.selectFrom('tracks')
      .select(['title', sql<number>`title = ${shortTitle}`.as('sameTitle')])
      .where('id', '!=', id)
      .where((eb)  =>  eb.or([eb('title', '=', shortTitle), eb('short_title', '=', shortTitle)]))
      .orderBy('sameTitle', 'desc')
      .executeTakeFirst();

    if (clash) {
      throw new HttpError(409, (Number(clash.sameTitle)
        ?  `"${shortTitle}" is the name of another track`
        :  `"${shortTitle}" is the short name of another track, ${clash.title}`));
    }

    if (shortTitle !== track.shortTitle) {
      await db.updateTable('tracks')
        .set({ short_title: shortTitle, updated_at: sql<string>`CURRENT_TIMESTAMP(3)` })
        .where('id', '=', id)
        .execute();
    }

    return { track: { ...track, shortTitle } };
  });
};
