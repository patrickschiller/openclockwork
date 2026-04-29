using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BagChronos.Infrastructure.Seeding;

public class SeedRunner(BagChronosDbContext db, ILogger<SeedRunner> logger)
{
    public async Task RunAsync(CancellationToken cancellationToken = default)
    {
        var hrAdmin = await UpsertAsync(new EmployeeSeed(
            PersonalNo: "P-0001",
            FirstName: "Anna",
            LastName: "Müller",
            Email: "anna.mueller@bagchronos.local",
            Role: Role.HRAdmin,
            TimeModel: TimeModel.Vollzeit,
            WeeklyHours: 40m,
            AnnualLeaveDays: 30,
            ManagerPersonalNo: null), cancellationToken);

        var managerOps = await UpsertAsync(new EmployeeSeed(
            PersonalNo: "P-0002",
            FirstName: "Thomas",
            LastName: "Schmidt",
            Email: "thomas.schmidt@bagchronos.local",
            Role: Role.Manager,
            TimeModel: TimeModel.Vollzeit,
            WeeklyHours: 40m,
            AnnualLeaveDays: 30,
            ManagerPersonalNo: hrAdmin.PersonalNo), cancellationToken);

        var managerSales = await UpsertAsync(new EmployeeSeed(
            PersonalNo: "P-0003",
            FirstName: "Sabine",
            LastName: "Weber",
            Email: "sabine.weber@bagchronos.local",
            Role: Role.Manager,
            TimeModel: TimeModel.Vertrauensarbeitszeit,
            WeeklyHours: 40m,
            AnnualLeaveDays: 30,
            ManagerPersonalNo: hrAdmin.PersonalNo), cancellationToken);

        var employees = new (string First, string Last, TimeModel Model, decimal Hours, int Leave)[]
        {
            ("Lukas", "Becker", TimeModel.Vollzeit, 40m, 30),
            ("Maria", "Fischer", TimeModel.Teilzeit, 20m, 24),
            ("Jonas", "Hoffmann", TimeModel.Gleitzeit, 40m, 30),
            ("Lea", "Wagner", TimeModel.Vollzeit, 40m, 30),
            ("Tim", "Schulz", TimeModel.Vollzeit, 40m, 28),
            ("Nina", "Meyer", TimeModel.Teilzeit, 30m, 30),
            ("Felix", "Bauer", TimeModel.Vertrauensarbeitszeit, 40m, 30),
            ("Sophie", "Koch", TimeModel.Gleitzeit, 35m, 30),
            ("Paul", "Richter", TimeModel.Vollzeit, 40m, 30),
            ("Hannah", "Klein", TimeModel.Teilzeit, 24m, 28),
            ("David", "Wolf", TimeModel.Vollzeit, 40m, 30),
            ("Laura", "Neumann", TimeModel.Gleitzeit, 40m, 30),
            ("Niklas", "Schwarz", TimeModel.Vollzeit, 40m, 30),
            ("Emma", "Zimmermann", TimeModel.Teilzeit, 28m, 28),
            ("Jan", "Braun", TimeModel.Vollzeit, 40m, 30),
            ("Mia", "Krüger", TimeModel.Gleitzeit, 40m, 30),
            ("Leon", "Hartmann", TimeModel.Vollzeit, 40m, 30),
            ("Lina", "Lange", TimeModel.Teilzeit, 32m, 30),
            ("Max", "Werner", TimeModel.Vertrauensarbeitszeit, 40m, 30),
            ("Clara", "Krause", TimeModel.Vollzeit, 40m, 30)
        };

        for (var i = 0; i < employees.Length; i++)
        {
            var data = employees[i];
            var manager = i % 2 == 0 ? managerOps : managerSales;
            var personalNo = $"P-{1000 + i + 1}";
            var email = $"{data.First}.{data.Last}@bagchronos.local"
                .Replace("ä", "ae")
                .Replace("ö", "oe")
                .Replace("ü", "ue")
                .Replace("ß", "ss")
                .ToLowerInvariant();

            await UpsertAsync(new EmployeeSeed(
                PersonalNo: personalNo,
                FirstName: data.First,
                LastName: data.Last,
                Email: email,
                Role: Role.Employee,
                TimeModel: data.Model,
                WeeklyHours: data.Hours,
                AnnualLeaveDays: data.Leave,
                ManagerPersonalNo: manager.PersonalNo), cancellationToken);
        }

        var totalEmployees = await db.Employees.CountAsync(cancellationToken);
        logger.LogInformation("Total employees in database: {Count}", totalEmployees);
    }

    private async Task<Employee> UpsertAsync(EmployeeSeed seed, CancellationToken cancellationToken)
    {
        Guid? managerId = null;
        if (seed.ManagerPersonalNo is not null)
        {
            var manager = await db.Employees
                .FirstOrDefaultAsync(e => e.PersonalNo == seed.ManagerPersonalNo, cancellationToken)
                ?? throw new InvalidOperationException(
                    $"Manager with PersonalNo '{seed.ManagerPersonalNo}' not seeded yet.");
            managerId = manager.Id;
        }

        var existing = await db.Employees
            .FirstOrDefaultAsync(e => e.PersonalNo == seed.PersonalNo, cancellationToken);

        if (existing is null)
        {
            var newEmployee = new Employee
            {
                PersonalNo = seed.PersonalNo,
                FirstName = seed.FirstName,
                LastName = seed.LastName,
                Email = seed.Email,
                Role = seed.Role,
                TimeModel = seed.TimeModel,
                WeeklyHours = seed.WeeklyHours,
                AnnualLeaveDays = seed.AnnualLeaveDays,
                ManagerId = managerId
            };
            db.Employees.Add(newEmployee);
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("+ {PersonalNo} {Name} ({Role})",
                newEmployee.PersonalNo,
                $"{newEmployee.FirstName} {newEmployee.LastName}",
                newEmployee.Role);
            return newEmployee;
        }

        existing.FirstName = seed.FirstName;
        existing.LastName = seed.LastName;
        existing.Email = seed.Email;
        existing.Role = seed.Role;
        existing.TimeModel = seed.TimeModel;
        existing.WeeklyHours = seed.WeeklyHours;
        existing.AnnualLeaveDays = seed.AnnualLeaveDays;
        existing.ManagerId = managerId;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("= {PersonalNo} {Name} (updated)",
            existing.PersonalNo,
            $"{existing.FirstName} {existing.LastName}");
        return existing;
    }

    private sealed record EmployeeSeed(
        string PersonalNo,
        string FirstName,
        string LastName,
        string Email,
        Role Role,
        TimeModel TimeModel,
        decimal WeeklyHours,
        int AnnualLeaveDays,
        string? ManagerPersonalNo);
}
