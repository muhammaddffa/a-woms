import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CashAdvanceReportService } from './cash-advance-report.service.js';
import { CashAdvanceService } from './cash-advance.service.js';
import {
  actualsSchema,
  createCashAdvanceSchema,
  createExtraCostSchema,
  listCashAdvancesQuerySchema,
  noteSchema,
  paySchema,
  reasonSchema,
  updateCashAdvanceSchema,
  updateExtraCostSchema,
  type ActualsDto,
  type CreateCashAdvanceDto,
  type CreateExtraCostDto,
  type ListCashAdvancesQuery,
  type NoteDto,
  type PayDto,
  type ReasonDto,
  type UpdateCashAdvanceDto,
  type UpdateExtraCostDto,
} from './dto/cash-advance.dto.js';

const P = PERMISSIONS;

@Controller('cash-advances')
export class CashAdvanceController {
  constructor(
    private readonly service: CashAdvanceService,
    private readonly report: CashAdvanceReportService,
  ) {}

  // ---------- baca ----------
  @Get()
  @Permissions(P.CASH_ADVANCE_VIEW.code)
  list(@Query(new ZodValidationPipe(listCashAdvancesQuerySchema)) query: ListCashAdvancesQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  @Permissions(P.CASH_ADVANCE_VIEW.code)
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/history')
  @Permissions(P.CASH_ADVANCE_VIEW.code)
  history(@CurrentUser() actor: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.service.history(actor, id);
  }

  // ---------- pengajuan ----------
  @Post()
  @Permissions(P.CASH_ADVANCE_CREATE.code)
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createCashAdvanceSchema)) dto: CreateCashAdvanceDto,
  ) {
    return this.service.create(actor, dto);
  }

  @Patch(':id')
  @Permissions(P.CASH_ADVANCE_CREATE.code)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(updateCashAdvanceSchema)) dto: UpdateCashAdvanceDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions(P.CASH_ADVANCE_CREATE.code)
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) dto: ReasonDto,
  ) {
    return this.service.cancel(actor, id, dto.reason);
  }

  // ---------- cek -> setujui -> bayar -> verifikasi transfer ----------
  @Post(':id/check')
  @HttpCode(HttpStatus.OK)
  @Permissions(P.CASH_ADVANCE_CHECK.code)
  check(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(noteSchema)) dto: NoteDto,
  ) {
    return this.service.check(actor, id, dto.note);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Permissions(P.CASH_ADVANCE_APPROVE.code)
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(noteSchema)) dto: NoteDto,
  ) {
    return this.service.approve(actor, id, dto.note);
  }

  // Izin (check ATAU approve) diperiksa di service.
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) dto: ReasonDto,
  ) {
    return this.service.reject(actor, id, dto.reason);
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @Permissions(P.CASH_ADVANCE_PAY.code)
  pay(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(paySchema)) dto: PayDto,
  ) {
    return this.service.pay(actor, id, dto);
  }

  @Post(':id/verify-transfer')
  @HttpCode(HttpStatus.OK)
  @Permissions(P.CASH_ADVANCE_VERIFY_TRANSFER.code)
  verifyTransfer(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(noteSchema)) dto: NoteDto,
  ) {
    return this.service.verifyTransfer(actor, id, dto.note);
  }

  // ---------- LPJ ----------
  @Put(':id/report/actuals')
  @Permissions(P.CASH_ADVANCE_SUBMIT_REPORT.code)
  saveActuals(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(actualsSchema)) dto: ActualsDto,
  ) {
    return this.report.saveActuals(actor, id, dto);
  }

  @Post(':id/extra-costs')
  @Permissions(P.CASH_ADVANCE_SUBMIT_REPORT.code)
  addExtraCost(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(createExtraCostSchema)) dto: CreateExtraCostDto,
  ) {
    return this.report.addExtraCost(actor, id, dto);
  }

  @Patch(':id/extra-costs/:extraId')
  @Permissions(P.CASH_ADVANCE_SUBMIT_REPORT.code)
  updateExtraCost(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('extraId', ParseIdPipe) extraId: string,
    @Body(new ZodValidationPipe(updateExtraCostSchema)) dto: UpdateExtraCostDto,
  ) {
    return this.report.updateExtraCost(actor, id, extraId, dto);
  }

  @Delete(':id/extra-costs/:extraId')
  @Permissions(P.CASH_ADVANCE_SUBMIT_REPORT.code)
  removeExtraCost(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('extraId', ParseIdPipe) extraId: string,
  ) {
    return this.report.removeExtraCost(actor, id, extraId);
  }

  @Post(':id/report/submit')
  @HttpCode(HttpStatus.OK)
  @Permissions(P.CASH_ADVANCE_SUBMIT_REPORT.code)
  submitReport(@CurrentUser() actor: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.report.submit(actor, id);
  }

  @Post(':id/report/check')
  @HttpCode(HttpStatus.OK)
  @Permissions(P.CASH_ADVANCE_CHECK_REPORT.code)
  checkReport(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(noteSchema)) dto: NoteDto,
  ) {
    return this.report.check(actor, id, dto.note);
  }

  // Izin (check_report ATAU approve_report) diperiksa di service.
  @Post(':id/report/return')
  @HttpCode(HttpStatus.OK)
  returnReport(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) dto: ReasonDto,
  ) {
    return this.report.returnReport(actor, id, dto.reason);
  }

  @Post(':id/report/approve')
  @HttpCode(HttpStatus.OK)
  @Permissions(P.CASH_ADVANCE_APPROVE_REPORT.code)
  approveReport(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(noteSchema)) dto: NoteDto,
  ) {
    return this.report.approve(actor, id, dto.note);
  }
}
