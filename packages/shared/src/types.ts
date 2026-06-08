export enum Role {
  ADMIN = 'ADMIN',
  STOREKEEPER = 'STOREKEEPER',
  TEACHER = 'TEACHER'
}

export enum ItemType {
  CONSUMABLE = 'CONSUMABLE',
  RETURNABLE = 'RETURNABLE'
}

export enum RequestStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PARTIALLY_ISSUED = 'PARTIALLY_ISSUED',
  FULLY_ISSUED = 'FULLY_ISSUED'
}

export enum ReturnCondition {
  GOOD = 'GOOD',
  DAMAGED = 'DAMAGED',
  LOST = 'LOST'
}

export enum LimitPeriod {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  TERM = 'TERM'
}
