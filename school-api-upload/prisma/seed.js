"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const departments = ['Science', 'Mathematics', 'Humanities', 'Administration'];
    for (const name of departments) {
        await prisma.department.upsert({
            where: { name },
            update: {},
            create: { name }
        });
    }
    const adminPasswordHash = await bcryptjs_1.default.hash('Admin@123', 10);
    const storekeeperPasswordHash = await bcryptjs_1.default.hash('Store@123', 10);
    const teacherPasswordHash = await bcryptjs_1.default.hash('Teacher@123', 10);
    const adminDepartment = await prisma.department.findUniqueOrThrow({ where: { name: 'Administration' } });
    const scienceDepartment = await prisma.department.findUniqueOrThrow({ where: { name: 'Science' } });
    await prisma.user.upsert({
        where: { email: 'admin@school.local' },
        update: {},
        create: {
            email: 'admin@school.local',
            name: 'School Admin',
            role: client_1.Role.ADMIN,
            passwordHash: adminPasswordHash,
            departmentId: adminDepartment.id
        }
    });
    await prisma.user.upsert({
        where: { email: 'storekeeper@school.local' },
        update: {},
        create: {
            email: 'storekeeper@school.local',
            name: 'Storekeeper',
            role: client_1.Role.STOREKEEPER,
            passwordHash: storekeeperPasswordHash,
            departmentId: adminDepartment.id
        }
    });
    await prisma.user.upsert({
        where: { email: 'teacher@school.local' },
        update: {},
        create: {
            email: 'teacher@school.local',
            name: 'Teacher One',
            role: client_1.Role.TEACHER,
            passwordHash: teacherPasswordHash,
            departmentId: scienceDepartment.id
        }
    });
    console.log('Seed completed');
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
