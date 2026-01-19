import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ensureUniqueUsername = async (base) => {
  let username = base;
  let suffix = 1;

  while (suffix < 50) {
    const existing = await prisma.user.findUnique({
      where: { username },
    });
    if (!existing) {
      return username;
    }
    username = `${base}${suffix}`;
    suffix += 1;
  }

  return `${base}${Date.now().toString().slice(-5)}`;
};

async function ensureUser(email, preferredUsername, name) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing;
  }

  const username = await ensureUniqueUsername(preferredUsername);
  return prisma.user.create({
    data: {
      email,
      name,
      username,
      usernameLower: username.toLowerCase(),
    },
  });
}

async function main() {
  await prisma.like.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.report.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.post.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();

  const demo = await ensureUser("demo@yessenov.local", "demo", "Demo User");
  const mira = await ensureUser("mira@yessenov.local", "mira", "Mira");
  const alex = await ensureUser("alex@yessenov.local", "alex", "Alex");

  const postOne = await prisma.post.create({
    data: {
      authorId: demo.id,
      content:
        "\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u0432 Threads-\u043b\u0435\u043d\u0442\u0443",
    },
  });

  const postTwo = await prisma.post.create({
    data: {
      authorId: mira.id,
      content:
        "\u041f\u0435\u0440\u0432\u044b\u0439 \u0442\u0435\u0441\u0442\u043e\u0432\u044b\u0439 \u0442\u0440\u0435\u0434. \u0414\u0435\u043b\u0438\u043c\u0441\u044f \u043d\u043e\u0432\u043e\u0441\u0442\u044f\u043c\u0438!",
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.post.create({
      data: {
        authorId: alex.id,
        content:
          "\u042f \u0443\u0447\u0430\u0441\u0442\u0432\u0443\u044e, \u043d\u0443\u0436\u043d\u0430 \u043a\u043e\u043c\u0430\u043d\u0434\u0430 \u0434\u043b\u044f \u0434\u0438\u0437\u0430\u0439\u043d\u0430.",
        replyToId: postTwo.id,
      },
    });

    await tx.post.update({
      where: { id: postTwo.id },
      data: { replyCount: { increment: 1 } },
    });
  });

  await prisma.$transaction(async (tx) => {
    await tx.post.create({
      data: {
        authorId: alex.id,
        content:
          "\u0421\u0434\u0435\u043b\u0430\u043b \u0440\u0435\u043f\u043e\u0441\u0442, \u0447\u0442\u043e\u0431\u044b \u043d\u0435 \u043f\u043e\u0442\u0435\u0440\u044f\u0442\u044c.",
        repostOfId: postOne.id,
      },
    });

    await tx.post.update({
      where: { id: postOne.id },
      data: { repostCount: { increment: 1 } },
    });
  });

  await prisma.$transaction(async (tx) => {
    await tx.like.create({
      data: {
        userId: mira.id,
        postId: postOne.id,
      },
    });

    await tx.post.update({
      where: { id: postOne.id },
      data: { likeCount: { increment: 1 } },
    });
  });

  await prisma.follow.create({
    data: {
      followerId: demo.id,
      followingId: mira.id,
    },
  });

  await prisma.post.create({
    data: {
      authorId: demo.id,
      content:
        "\u041a\u0442\u043e \u0438\u0434\u0435\u0442 \u043d\u0430 \u0445\u0430\u043a\u0430\u0442\u043e\u043d \u0432 \u044d\u0442\u0438 \u0432\u044b\u0445\u043e\u0434\u043d\u044b\u0435?",
    },
  });

  await prisma.post.create({
    data: {
      authorId: mira.id,
      content:
        "\u041f\u043e\u0434\u043f\u0438\u0441\u044b\u0432\u0430\u0439\u0442\u0435\u0441\u044c \u2014 \u0431\u0443\u0434\u0435\u0442 \u043c\u043d\u043e\u0433\u043e \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0439.",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
