import { FastifyPluginCallback } from "fastify";

const shardsRoutes: FastifyPluginCallback = (fastify, options, done) => {
  fastify.get("/test", {}, async (request, reply) => {
    return {
      message: "Hello world!",
    };
  });

  done();
};

export default shardsRoutes;
