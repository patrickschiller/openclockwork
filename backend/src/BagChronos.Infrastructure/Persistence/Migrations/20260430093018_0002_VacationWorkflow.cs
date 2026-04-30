using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BagChronos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class _0002_VacationWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CalculatedDays",
                table: "Requests",
                type: "decimal(6,2)",
                precision: 6,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CancelledAt",
                table: "Requests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CurrentApproverId",
                table: "Requests",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "HrConfirmedAt",
                table: "Requests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SubstituteAcceptedAt",
                table: "Requests",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SubstituteId",
                table: "Requests",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WorkflowState",
                table: "Requests",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "EmployeeLeaveAllowances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EmployeeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Year = table.Column<int>(type: "int", nullable: false),
                    BaseDays = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    CarryOverDays = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    CarryOverExpiresOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AdjustmentDays = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    AdjustmentReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeLeaveAllowances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmployeeLeaveAllowances_Employees_EmployeeId",
                        column: x => x.EmployeeId,
                        principalTable: "Employees",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RequestEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ActorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RequestEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RequestEvents_Requests_RequestId",
                        column: x => x.RequestId,
                        principalTable: "Requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Requests_CurrentApproverId",
                table: "Requests",
                column: "CurrentApproverId");

            migrationBuilder.CreateIndex(
                name: "IX_Requests_SubstituteId",
                table: "Requests",
                column: "SubstituteId");

            migrationBuilder.CreateIndex(
                name: "IX_Requests_WorkflowState_CurrentApproverId",
                table: "Requests",
                columns: new[] { "WorkflowState", "CurrentApproverId" });

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeLeaveAllowances_EmployeeId_Year",
                table: "EmployeeLeaveAllowances",
                columns: new[] { "EmployeeId", "Year" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RequestEvents_RequestId_At",
                table: "RequestEvents",
                columns: new[] { "RequestId", "At" });

            migrationBuilder.AddForeignKey(
                name: "FK_Requests_Employees_CurrentApproverId",
                table: "Requests",
                column: "CurrentApproverId",
                principalTable: "Employees",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Requests_Employees_SubstituteId",
                table: "Requests",
                column: "SubstituteId",
                principalTable: "Employees",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // Backfill WorkflowState for rows that existed before Epic 4 from the legacy Status column.
            // Status: Submitted=0 → WorkflowState.PendingManager(3); Approved=1 → Approved(5); Rejected=2 → Rejected(6).
            migrationBuilder.Sql(@"
UPDATE Requests
SET WorkflowState = CASE Status
    WHEN 0 THEN 3
    WHEN 1 THEN 5
    WHEN 2 THEN 6
    ELSE 1
END;

UPDATE Requests
SET CalculatedDays = CASE
    WHEN [Type] = 0 THEN
        CAST(DATEDIFF(day, [From], [To]) + 1 AS decimal(6,2))
    ELSE 0
END
WHERE CalculatedDays = 0;
");

            // Bootstrap an EmployeeLeaveAllowance row for the current year for every existing employee,
            // pulling BaseDays from Employees.AnnualLeaveDays. Idempotent: skipped if a row already exists.
            migrationBuilder.Sql(@"
INSERT INTO EmployeeLeaveAllowances
    (Id, EmployeeId, [Year], BaseDays, CarryOverDays, CarryOverExpiresOn, AdjustmentDays, AdjustmentReason, CreatedAt, UpdatedAt)
SELECT
    NEWID(),
    e.Id,
    YEAR(SYSUTCDATETIME()),
    CAST(e.AnnualLeaveDays AS decimal(5,2)),
    0,
    NULL,
    0,
    NULL,
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
FROM Employees e
WHERE NOT EXISTS (
    SELECT 1 FROM EmployeeLeaveAllowances a
    WHERE a.EmployeeId = e.Id AND a.[Year] = YEAR(SYSUTCDATETIME())
);
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Requests_Employees_CurrentApproverId",
                table: "Requests");

            migrationBuilder.DropForeignKey(
                name: "FK_Requests_Employees_SubstituteId",
                table: "Requests");

            migrationBuilder.DropTable(
                name: "EmployeeLeaveAllowances");

            migrationBuilder.DropTable(
                name: "RequestEvents");

            migrationBuilder.DropIndex(
                name: "IX_Requests_CurrentApproverId",
                table: "Requests");

            migrationBuilder.DropIndex(
                name: "IX_Requests_SubstituteId",
                table: "Requests");

            migrationBuilder.DropIndex(
                name: "IX_Requests_WorkflowState_CurrentApproverId",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "CalculatedDays",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "CancelledAt",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "CurrentApproverId",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "HrConfirmedAt",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "SubstituteAcceptedAt",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "SubstituteId",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "WorkflowState",
                table: "Requests");
        }
    }
}
