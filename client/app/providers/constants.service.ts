import { Injectable } from '@angular/core';

@Injectable()
export class ConstantsService {
  API_BASE_URL: string = 'https://horse-linc.herokuapp.com/api';
  AWS_S3_BASE_URL: string = 'https://sm-horselinc.s3.amazonaws.com';
  ONESIGNAL_APP_ID: string = '990c922f-4713-4b1c-a973-bb0a19d7be17';
  GOOGLE_PROJECT_NUMBER: string = '974423753590';
  GOOGLE_ANALYTICS_TRACKING_ID: string = '';

  /**
   * Admin constants
   */
  FILE_UPLOAD_DEFAULT_ALLOWED_MIME_TYPES: string[] = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'text/plain', 'text/csv', 'audio/mpeg', 'video/mp4',
  ];
  FILE_UPLOAD_DEFAULT_MAX_FILE_SIZE: number = 10000000;
  IMAGE_MIME_TYPES: string[] = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  SIDEBAR_ITEMS: object[] = [
    {
      title: 'Users',
      icon: 'users',
      class: 'User',
    },
    {
      title: 'Horses',
      class: 'Horse',
    },
    {
      title: 'Invoices',
      class: 'Invoice',
    },
    {
      title: 'Requests',
      class: 'Request',
    },
    {
      title: 'Payments',
      class: 'Payment',
    },
    {
      title: 'Shows',
      class: 'Show',
    },
    {
      title: 'Notifications',
      class: 'Notification',
    },
  ];
  DEFAULT_SCHEMA_OVERWRITES: object = {
    Horse: {
      showName: {
        displayName: 'show name',
      },
      barnName: {
        displayName: 'barn name',
      },
      gender: {
        instanceOverride: 'SingleSelect',
        options: ['Mare', 'Stallion', 'Gelding'],
      },
      createdAt: {
        displayName: 'created at',
        instanceOptions: {
            disabled: true,
        },
      },
      updatedAt: {
        displayName: 'updated at',
        instanceOptions: {
            disabled: true,
        },
      },
      avatar: {
        instanceOverride: 'Image',
      },
      _owners: {
        displayName: 'owners',
      },
      _leasedTo: {
        displayName: 'leased to',
        searchField: 'name',
        displayKey: 'name',
      },
      _trainer: {
        displayName: 'trainer',
        searchField: 'name',
        displayKey: 'name',
      },
      _createdBy: {
        displayName: 'created by',
        searchField: 'name',
        displayKey: 'name',
      },
    },
    Request: {
      createdAt: {
        displayName: 'created at',
        instanceOptions: {
            disabled: true,
        },
      },
      _owners: {
        displayName: 'owners',
      },
      updatedAt: {
        displayName: 'updated at',
        instanceOptions: {
            disabled: true,
        },
      },
      deletedAt: {
        displayName: 'deleted at',
        instanceOptions: {
            disabled: false,
        },
      },
      _dismissedBy: {
        displayName: 'dismissed at',
        searchField: 'name',
        displayKey: 'name',
        instanceOptions: {
            disabled: false,
        },
      },
      _horse: {
        displayName: 'horse',
        searchField: 'barnName',
        displayKey: 'barnName',
      },
      _show: {
        displayName: 'show',
        searchField: 'name',
        displayKey: 'name',
      },
      _serviceProvider: {
        displayName: 'service provider',
        searchField: 'name',
        displayKey: 'name',
      },
      _reassignedTo: {
        displayName: 'reassigned To',
        searchField: 'name',
        displayKey: 'name',
      },
      _previousReassignees: {
        displayName: 'previous reassignees',
        searchField: 'name',
        displayKey: 'name',
      },
      _horseManager: {
        displayName: 'horse manager',
        searchField: 'name',
        displayKey: 'name',
      },
      _payingUser: {
        displayName: 'user paying request',
        searchField: 'name',
        displayKey: 'name',
      },
      _trainer: {
        displayName: 'trainer',
        searchField: 'name',
        displayKey: 'name',
      },
      _leasedTo: {
        displayName: 'leased to',
        searchField: 'name',
        displayKey: 'name',
      },
    },
    Payment: {
      createdAt: {
        displayName: 'created at',
        instanceOptions: {
            disabled: true,
        },
      },
      percentOfInvoice: {
        displayName: 'percentage of invoice',
      },
      updatedAt: {
        displayName: 'updated at',
        instanceOptions: {
            disabled: true,
        },
      },
      paidOutsideAppAt: {
        displayName: 'paid outside app',
      },
      _horse: {
        displayName: 'horse',
        searchField: 'barnName',
        displayKey: 'barnName',
      },
      _invoice: {
        displayName: 'invoice',
        searchField: '_id',
        displayKey: '_id',
      },
      _serviceProvider: {
        displayName: 'service provider',
        searchField: 'name',
        displayKey: 'name',
      },
      _payingUser: {
        displayName: 'paying user',
        searchField: 'name',
        displayKey: 'name',
      },
      _paymentSubmittedBy: {
        displayName: 'payment submitted by',
        searchField: 'name',
        displayKey: 'name',
      },
      _horseManager: {
        displayName: 'horse manager',
        searchField: 'name',
        displayKey: 'name',
      },
      _requests: {
        displayName: 'requests',
        searchField: '_id',
        displayKey: '_id',
      },
      amount: {
        instanceOptions: {
            disabled: true,
        },
      },
      tip: {
        displayName: 'tip',
        instanceOptions: {
            disabled: true,
        },
      },
    },
    Invoice: {
       _serviceProvider: {
        displayName: 'service provider',
        searchField: 'name',
        displayKey: 'name',
      },
      _trainer: {
        displayName: 'trainer',
        searchField: 'name',
        displayKey: 'name',
      },
      _requests: {
        displayName: 'requests',
        searchField: '_id',
        displayKey: '_id',
      },
      _reassignees: {
        displayName: 'reassigned to',
        searchField: 'name',
        displayKey: 'name',
      },
      _leasee: {
        displayName: 'leased to',
        searchField: 'name',
        displayKey: 'name',
      },
      _horse: {
        displayName: 'horse',
        searchField: 'barnName',
        displayKey: 'barnName',
      },
      _owners: {
        displayName: 'owners',
      },
      _payingUsers: {
        displayName: 'paying users',
      },
      paymentApprovals: {
        displayName: 'payment approvals',
      },
      paidOutsideAppAt: {
        displayName: 'paid outside app',
      },
      paidInFullAt: {
        displayName: 'paid in full at',
      },
    },
    Show: {
      createdAt: {
        displayName: 'created at',
        instanceOptions: {
            disabled: true,
        },
      },
      updatedAt: {
        displayName: 'updated at',
        instanceOptions: {
            disabled: true,
        },
      },
    },
    Notification: {
      _recipients: {
        displayName: 'recipient(s)',
        searchField: 'name',
        displayKey: 'name',
      },
      createdAt: {
        displayName: 'created at',
        instanceOptions: {
            disabled: true,
        },
      },
      updatedAt: {
        displayName: 'updated at',
        instanceOptions: {
            disabled: true,
        },
      },
    },
    User: {
      avatar: {
        instanceOverride: 'Image',
        allowedMimeType: ['image/jpeg', 'image/jpg', 'image/png'],
      },
      roles: {
        instanceOverride: 'MultiSelect',
        options: ['admin', 'service provider', 'user', 'horse manager'],
      },
      stripeSellerId: {
        instanceOverride: 'Hidden',
      },
      stripeCustomerId: {
        instanceOverride: 'Hidden',
      },
      stripeLast4: {
        instanceOverride: 'Hidden',
      },
      stripeExpMonth: {
        instanceOverride: 'Hidden',
      },
      stripeExpYear: {
        instanceOverride: 'Hidden',
      },
      password: {
        instanceOverride: 'Remove',
      },
      salt: {
        instanceOverride: 'Remove',
      },
      resetPasswordToken: {
        instanceOverride: 'Hidden',
      },
      resetPasswordExpires: {
        displayName: 'reset password expires',
        instanceOptions: {
          disabled: true,
        },
      },
      createdAt: {
        instanceOptions: {
          disabled: true,
        },
      },
      updatedAt: {
        instanceOptions: {
          disabled: true,
        },
      },
      provider: {
        instanceOptions: {
          disabled: true,
        },
      },
    },
  };

  constructor() {
    // Only add dynamic constants here
    // e.g. this.ROOT_URL = window.location.origin;
  }
}
