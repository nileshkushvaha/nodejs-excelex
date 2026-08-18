import {
  choice,
  date,
  decimal,
  flag,
  integer,
  reference,
  status,
  text,
  type MasterSpec,
} from "./master-spec";

/**
 * Every master that can be imported and exported, as a table.
 *
 * The order of the columns is the order of the file, and the first column is
 * the code — the engine upserts on it and names it in errors.
 *
 * A master appears here or it does not have import and export. That is the
 * intent: the list of what is possible should be readable in one screen
 * rather than inferred from which controllers happen to have an endpoint.
 */
export const MASTERS: Record<string, MasterSpec> = {
  zones: {
    key: "zone",
    label: { one: "Zone", many: "Zones" },
    resource: "zone",
    model: "zone",
    columns: [
      text("Zone Code", "code", { required: true, upper: true, aliases: ["code"] }),
      text("Zone Name", "name", { required: true, aliases: ["name"] }),
      status(),
    ],
    example: ["Z1", "Zone 1 — Within city", "Active"],
  },

  "product-types": {
    key: "product_type",
    label: { one: "Product type", many: "Product types" },
    resource: "productType",
    model: "productType",
    columns: [
      text("Code", "code", { required: true, upper: true, aliases: ["typecode", "productcode"] }),
      text("Name", "name", { required: true, aliases: ["typename"] }),
      status(),
    ],
    example: ["D", "Domestic", "Active"],
  },

  "product-groups": {
    key: "product_group",
    label: { one: "Product group", many: "Product groups" },
    resource: "productGroup",
    model: "productGroup",
    columns: [
      text("Code", "code", { required: true, upper: true, aliases: ["groupcode"] }),
      text("Name", "name", { required: true, aliases: ["groupname"] }),
      status(),
    ],
    example: ["AIR", "Air", "Active"],
  },

  departments: {
    key: "department",
    label: { one: "Department", many: "Departments" },
    resource: "department",
    model: "department",
    columns: [
      text("Code", "code", { required: true, upper: true, aliases: ["departmentcode"] }),
      text("Name", "name", { required: true, aliases: ["departmentname"] }),
      text("Description", "description"),
      status(),
    ],
    example: ["CS", "Customer Service", "Tracking enquiries and escalations.", "Active"],
  },

  designations: {
    key: "designation",
    label: { one: "Designation", many: "Designations" },
    resource: "designation",
    model: "designation",
    lookups: [{ name: "department", model: "department" }],
    include: { department: true },
    columns: [
      text("Code", "code", { required: true, upper: true, aliases: ["designationcode"] }),
      text("Title", "name", { required: true, aliases: ["name", "designationname"] }),
      reference("Department", "departmentId", "department"),
      integer("Level", "level", { min: 0, max: 1000 }),
      text("Description", "description"),
      status(),
    ],
    example: ["BR-MGR", "Branch Manager", "OPS", 60, "Accountable for a whole branch.", "Active"],
  },

  "sales-executives": {
    key: "sales_executive",
    label: { one: "Sales executive", many: "Sales executives" },
    resource: "salesExecutive",
    model: "salesExecutive",
    columns: [
      text("Code", "code", { required: true, upper: true, aliases: ["salesexcode"] }),
      text("Name", "name", { required: true, aliases: ["salesexname"] }),
      // Bounded here as well as in the database, so the file is rejected with
      // a row number rather than by a constraint with none.
      decimal("Commission", "commissionPercent", { min: 0, max: 100, aliases: ["commissionpercent"] }),
      text("Email", "email"),
      text("Mobile", "mobile"),
      status(),
    ],
    example: ["RAH", "Rahul Singh", "2.5", "rahul@example.com", "9810000000", "Active"],
  },

  charges: {
    key: "charge",
    label: { one: "Charge", many: "Charges" },
    resource: "charge",
    model: "charge",
    columns: [
      text("Code", "code", { required: true, upper: true, aliases: ["chargecode", "descriptioncode"] }),
      text("Name", "name", { required: true, aliases: ["chargename", "descriptionname"] }),
      choice("Charge Type", "chargeType", ["AIRWAYBILL", "EXPENSE", "INCOME", "PURCHASE"] as const),
      choice(
        "Calculation Base",
        "calculationBase",
        [
          "ACTUAL_WEIGHT", "CHARGE_WEIGHT", "COD_AMOUNT", "COMMERCIAL", "FLAT", "FREIGHT",
          "ODA", "ODA1", "ODA2", "ODA3", "PIECES", "POINT", "SHIPMENT_VALUE",
        ] as const,
        { aliases: ["baseon"] },
      ),
      decimal("Rate", "rate", { aliases: ["chargerate"] }),
      flag("Apply Fuel", "applyFuel", { aliases: ["fuel"] }),
      flag("Apply Tax On Fuel", "applyTaxOnFuel", { aliases: ["taxonfuel"] }),
      flag("Apply Tax", "applyTax", { aliases: ["tax"] }),
      text("HSN Code", "hsnCode"),
      integer("Sequence", "sequence", { min: 0 }),
      status(),
    ],
    example: ["AWB", "Airwaybill Charges", "AIRWAYBILL", "FLAT", "100", "Yes", "Yes", "Yes", "996812", 1, "Active"],
  },

  "account-groups": {
    key: "account_group",
    label: { one: "Account group", many: "Account groups" },
    resource: "accountGroup",
    model: "accountGroup",
    lookups: [{ name: "group", model: "accountGroup" }],
    include: { parent: true },
    columns: [
      text("Group Code", "code", { required: true, upper: true, aliases: ["code"] }),
      text("Group Name", "name", { required: true, aliases: ["name"] }),
      reference("Under Group", "parentId", "group", { relation: "parent", aliases: ["undergroup", "parent"] }),
      status(),
    ],
    example: ["A3300", "Sundry Debtors", "", "Active"],
  },

  consignees: {
    key: "consignee",
    label: { one: "Consignee", many: "Consignees" },
    resource: "consignee",
    model: "consignee",
    lookups: [
      { name: "destination", model: "destination" },
      { name: "service centre", model: "serviceCentre" },
    ],
    include: { destination: true, serviceCentre: true },
    columns: [
      text("Consignee Code", "code", { required: true, upper: true, aliases: ["code"] }),
      text("Consignee Name", "name", { required: true, aliases: ["name"] }),
      reference("Destination Code", "destinationId", "destination", { aliases: ["destination"] }),
      text("Contact Person", "contactPerson"),
      text("Address1", "addressLine1", { aliases: ["addressline1"] }),
      text("Address2", "addressLine2", { aliases: ["addressline2"] }),
      text("Pin Code", "pinCode"),
      text("City", "city"),
      text("State", "stateCode", { upper: true }),
      text("Telephone1", "telephone1", { aliases: ["telno1"] }),
      text("Telephone2", "telephone2", { aliases: ["telno2"] }),
      text("Fax", "fax"),
      text("Email", "email", { aliases: ["emailid"] }),
      text("Mobile", "mobile"),
      text("Industry", "industry"),
      reference("Service Center", "serviceCentreId", "service centre", { aliases: ["servicecentre"] }),
      text("EORI", "eori", { upper: true }),
      text("VAT", "vat", { upper: true }),
      status(),
    ],
  },

  shippers: {
    key: "shipper",
    label: { one: "Shipper", many: "Shippers" },
    resource: "shipper",
    model: "shipper",
    lookups: [
      { name: "origin", model: "destination" },
      { name: "service centre", model: "serviceCentre" },
    ],
    include: { origin: true, serviceCentre: true },
    columns: [
      text("Shipper Code", "code", { required: true, upper: true, aliases: ["code"] }),
      text("Shipper Name", "name", { required: true, aliases: ["name"] }),
      reference("Origin Code", "originId", "origin", { aliases: ["origin"] }),
      text("Contact Person", "contactPerson"),
      text("Address1", "addressLine1", { aliases: ["addressline1"] }),
      text("Address2", "addressLine2", { aliases: ["addressline2"] }),
      text("Pin Code", "pinCode"),
      text("City", "city"),
      text("State", "stateCode", { upper: true }),
      text("Telephone1", "telephone1", { aliases: ["telno1"] }),
      text("Telephone2", "telephone2", { aliases: ["telno2"] }),
      text("Fax", "fax"),
      text("Email", "email", { aliases: ["emailid"] }),
      text("Mobile No", "mobile", { aliases: ["mobile"] }),
      text("Industry", "industry"),
      reference("Service Center", "serviceCentreId", "service centre", { aliases: ["servicecentre"] }),
      text("GST No", "gstin", { upper: true, aliases: ["gstno"] }),
      text("Aadhar No", "aadhaar", { aliases: ["aadharno"] }),
      text("PAN No", "pan", { upper: true, aliases: ["panno"] }),
      text("IEC No", "iecNo", { upper: true, aliases: ["iecno"] }),
      text("Bank AD Code", "bankAdCode"),
      text("Bank Account", "bankAccount"),
      text("Bank IFSC", "bankIfsc", { upper: true }),
      choice("Firm", "firm", ["GOVT", "NON_GOVT"] as const),
      text("LUT Number", "lutNumber"),
      date("LUT Issue Date", "lutIssueDate"),
      date("LUT Till Date", "lutTillDate"),
      flag("NFEI", "nfei"),
      status(),
    ],
  },

  products: {
    key: "product",
    label: { one: "Product", many: "Products" },
    resource: "product",
    model: "product",
    lookups: [
      { name: "product type", model: "productType" },
      { name: "product group", model: "productGroup" },
    ],
    include: { productType: true, productGroup: true },
    columns: [
      text("Product Code", "code", { required: true, upper: true, aliases: ["code"] }),
      text("Product Name", "name", { required: true, aliases: ["name"] }),
      reference("Product Type", "productTypeId", "product type", { relation: "productType" }),
      reference("Group Type", "productGroupId", "product group", { relation: "productGroup", aliases: ["productgroup", "group"] }),
      text("Product Service", "service", { aliases: ["service"] }),
      choice("Content", "contentKind", ["DOX", "NDOX"] as const, { aliases: ["contentkind", "doxndox"] }),
      flag("Fuel Charge", "fuelCharge", { aliases: ["fuel"] }),
      flag("GST Reverse", "gstReverse", { aliases: ["rcm", "reversecharge"] }),
      status(),
    ],
    example: ["DOM", "Domestic Courier", "D", "AIR", "", "NDOX", "Yes", "No", "Active"],
  },

  "service-centres": {
    key: "service_centre",
    label: { one: "Service centre", many: "Service centres" },
    resource: "serviceCentre",
    model: "serviceCentre",
    lookups: [{ name: "destination", model: "destination" }],
    include: { destination: true },
    columns: [
      text("Code", "code", { required: true, upper: true, aliases: ["servicecentrecode"] }),
      text("Name", "name", { required: true, aliases: ["servicecentrename"] }),
      text("Sub Name", "subName", { aliases: ["subname"] }),
      reference("Branch", "destinationId", "destination", { aliases: ["destination"] }),
      text("Address1", "addressLine1", { aliases: ["addressline1"] }),
      text("Address2", "addressLine2", { aliases: ["addressline2"] }),
      text("Pin Code", "pinCode"),
      text("State", "stateCode", { upper: true }),
      text("Telephone", "telephone"),
      text("Email", "email"),
      text("GSTIN", "gstin", { upper: true, aliases: ["gstno"] }),
      text("PAN", "pan", { upper: true, aliases: ["panno"] }),
      status(),
    ],
  },
};

export type MasterKey = keyof typeof MASTERS;
