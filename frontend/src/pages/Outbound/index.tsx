import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type FC,
  type Key,
} from "react";
import {
  Button,
  Form,
  message,
  Card,
  Typography,
  Row,
  Col,
  Divider,
} from "antd";
import type { TableProps } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import dayjs, { type Dayjs } from "dayjs";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useSimpleApi, useSimpleApiData } from "@/hooks/useSimpleApi";
import OutboundFilter from "@/pages/Outbound/components/OutboundFilter";
import OutboundTable from "@/pages/Outbound/components/OutboundTable";
import OutboundModal from "@/pages/Outbound/components/OutboundModal";
import OutboundBatchModal from "@/pages/Outbound/components/OutboundBatchModal";
import type {
  ApiListResponse,
  FetchParams,
  OutboundFilters,
  OutboundFormValues,
  OutboundListResponse,
  OutboundRecord,
  Partner,
  Product,
  SorterState,
} from "./types";

const { Title } = Typography;

interface PaginationState {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
}

const DEFAULT_PAGINATION: PaginationState = {
  current: 1,
  pageSize: 10,
  total: 0,
};

const Outbound: FC = () => {
  const { t } = useTranslation();
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<OutboundRecord | null>(
    null
  );
  const [form] = Form.useForm<OutboundFormValues>();
  const [batchForm] = Form.useForm<OutboundFormValues>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [filters, setFilters] = useState<OutboundFilters>({
    customer_short_name: undefined,
    product_model: undefined,
    dateRange: [null, null],
  });
  const [sorter, setSorter] = useState<SorterState>({});
  const [manualPrice, setManualPrice] = useState(false);
  const [batchManualPrice, setBatchManualPrice] = useState(false);
  const [pagination, setPagination] =
    useState<PaginationState>(DEFAULT_PAGINATION);

  const { get, post, put, delete: deleteRequest } = useSimpleApi();

  const { data: partnersResponse } = useSimpleApiData<ApiListResponse<Partner>>(
    "/partners",
    {
      data: [],
    }
  );
  const { data: productsResponse } = useSimpleApiData<ApiListResponse<Product>>(
    "/products",
    {
      data: [],
    }
  );

  const partners = useMemo<Partner[]>(() => {
    const data = partnersResponse?.data;
    if (!Array.isArray(data)) {
      return [];
    }
    return data.filter((partner) => partner.type === 1);
  }, [partnersResponse]);

  const products = useMemo<Product[]>(() => {
    const data = productsResponse?.data;
    return Array.isArray(data) ? data : [];
  }, [productsResponse]);

  const customerShortName = filters.customer_short_name ?? "";
  const productModel = filters.product_model ?? "";
  const [startDateRaw, endDateRaw] = filters.dateRange;
  const startDate = startDateRaw ?? "";
  const endDate = endDateRaw ?? "";

  const fetchOutboundRecords = useCallback(
    async (params: FetchParams = {}) => {
      try {
        setLoading(true);
        const page = params.page ?? 1;
        const query = new URLSearchParams({
          page: String(page),
          customer_short_name: params.customer_short_name ?? customerShortName,
          product_model: params.product_model ?? productModel,
          start_date: params.start_date ?? startDate,
          end_date: params.end_date ?? endDate,
          sort_field: params.sort_field ?? sorter.field ?? "",
          sort_order: params.sort_order ?? sorter.order ?? "",
        });

        const result = await get<OutboundListResponse>(
          `/outbound?${query.toString()}`
        );

        setOutboundRecords(Array.isArray(result?.data) ? result.data : []);
        setPagination((prev: PaginationState) => ({
          current: result?.pagination?.page ?? page,
          pageSize: result?.pagination?.limit ?? prev.pageSize,
          total: result?.pagination?.total ?? prev.total,
        }));
      } catch (error) {
        console.error("获取出库记录失败:", error);
        setOutboundRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [
      customerShortName,
      endDate,
      get,
      productModel,
      sorter.field,
      sorter.order,
      startDate,
    ]
  );

  useEffect(() => {
    fetchOutboundRecords({ page: 1 });
  }, [fetchOutboundRecords]);

  const handleAdd = (): void => {
    setEditingRecord(null);
    setManualPrice(false);
    form.resetFields();
    form.setFieldsValue({
      outbound_date: dayjs(),
      manual_price: false,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: OutboundRecord): void => {
    setEditingRecord(record);
    const customer = partners.find(
      (partner) => partner.code === record.customer_code
    );
    const product = products.find(
      (item) => item.product_model === record.product_model
    );

    form.setFieldsValue({
      ...record,
      customer_short_name: record.partner?.short_name || customer?.short_name,
      customer_code: record.customer_code,
      product_code: product?.code ?? "",
      outbound_date: record.outbound_date ? dayjs(record.outbound_date) : null,
      invoice_date: record.invoice_date ? dayjs(record.invoice_date) : null,
      receipt_number: record.receipt_number ?? null,
    });

    setManualPrice(Boolean(form.getFieldValue("manual_price")));
    setModalVisible(true);
  };

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await deleteRequest(`/outbound/${id}`);
      message.success(t("outbound.deleteSuccess") ?? "删除成功");
      fetchOutboundRecords();
    } catch (error) {
      console.error("删除失败:", error);
      message.error(t("outbound.deleteFailed") ?? "删除失败");
    }
  };

  const handleSave = async (values: OutboundFormValues): Promise<void> => {
    try {
      const customerCode = values.customer_code;
      const customerShortNameValue = values.customer_short_name;
      const productCode = values.product_code;
      const productModelValue = values.product_model;

      if (customerCode && customerShortNameValue) {
        const customer = partners.find(
          (partner) => partner.code === customerCode
        );
        if (customer?.short_name !== customerShortNameValue) {
          message.error(
            t("outbound.customerCodeShortNameMismatch") ??
              "客户代号与简称不匹配，请重新选择"
          );
          return;
        }
      }

      if (productCode && productModelValue) {
        const product = products.find((item) => item.code === productCode);
        if (product?.product_model !== productModelValue) {
          message.error(
            t("outbound.productCodeModelMismatch") ??
              "产品代号与型号不匹配，请重新选择"
          );
          return;
        }
      }

      const quantity = Number(values.quantity ?? 0);
      const unitPrice = Number(values.unit_price ?? 0);

      const payload = {
        ...values,
        outbound_date: values.outbound_date
          ? values.outbound_date.format("YYYY-MM-DD")
          : null,
        invoice_date: values.invoice_date
          ? values.invoice_date.format("YYYY-MM-DD")
          : null,
        total_price: quantity * unitPrice,
      };

      if (editingRecord) {
        await put(`/outbound/${editingRecord.id}`, payload);
        message.success(t("outbound.editSuccess") ?? "修改成功");
      } else {
        await post("/outbound", payload);
        message.success(t("outbound.addSuccess") ?? "新增成功");
      }

      setModalVisible(false);
      fetchOutboundRecords();
    } catch (error) {
      console.error("保存失败:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("outbound.saveFailed") ?? "保存失败";
      message.error(errorMessage);
    }
  };

  const handleCustomerCodeChange = (value: string): void => {
    const customer = partners.find((partner) => partner.code === value);
    if (customer) {
      form.setFieldsValue({
        customer_short_name: customer.short_name,
        customer_full_name: customer.full_name ?? null,
      });
    }
    handlePartnerOrProductChange();
  };

  const handleCustomerShortNameChange = (value: string): void => {
    const customer = partners.find((partner) => partner.short_name === value);
    if (customer) {
      form.setFieldsValue({
        customer_code: customer.code ?? null,
        customer_full_name: customer.full_name ?? null,
      });
    }
    handlePartnerOrProductChange();
  };

  const handleProductCodeChange = (value: string): void => {
    const product = products.find((item) => item.code === value);
    if (product) {
      form.setFieldsValue({
        product_model: product.product_model,
        product_category: product.category ?? null,
      });
    }
    handlePartnerOrProductChange();
  };

  const handleProductModelChange = (value: string): void => {
    const product = products.find((item) => item.product_model === value);
    if (product) {
      form.setFieldsValue({
        product_code: product.code ?? null,
        product_category: product.category ?? null,
      });
    }
    handlePartnerOrProductChange();
  };

  const handlePartnerOrProductChange = async (): Promise<void> => {
    if (manualPrice) {
      return;
    }

    const customerShortNameValue = form.getFieldValue("customer_short_name") as
      | string
      | undefined;
    const productModelValue = form.getFieldValue("product_model") as
      | string
      | undefined;
    const outboundDateValue = form.getFieldValue("outbound_date") as
      | Dayjs
      | undefined;

    if (customerShortNameValue && productModelValue && outboundDateValue) {
      try {
        const data = await get<{ unit_price: number }>(
          `/product-prices/auto?partner_short_name=${encodeURIComponent(
            customerShortNameValue
          )}&product_model=${encodeURIComponent(
            productModelValue
          )}&date=${outboundDateValue.format("YYYY-MM-DD")}`
        );
        form.setFieldsValue({ unit_price: data.unit_price });
        handlePriceOrQuantityChange();
      } catch (error) {
        console.error("获取价格失败:", error);
        form.setFieldsValue({ unit_price: 0 });
        message.warning(t("outbound.autoPriceFailed") ?? "自动获取价格失败");
      }
    }
  };

  const handlePriceOrQuantityChange = (): void => {
    const quantityValue = Number(form.getFieldValue("quantity") ?? 0);
    const unitPriceValue = Number(form.getFieldValue("unit_price") ?? 0);
    form.setFieldsValue({ total_price: quantityValue * unitPriceValue });
  };

  const handleBatchEdit = (): void => {
    if (selectedRowKeys.length === 0) {
      message.warning("Please select at least one record to edit");
      return;
    }
    setBatchManualPrice(false);
    batchForm.resetFields();
    batchForm.setFieldsValue({
      manual_price: false,
    });
    setBatchModalVisible(true);
  };

  const handleBatchSave = async (values: OutboundFormValues): Promise<void> => {
    try {
      const updates: Record<string, string | number | null> = {};

      // Only include fields that are actually filled
      if (values.customer_code) updates["customer_code"] = values.customer_code;
      if (values.customer_short_name)
        updates["customer_short_name"] = values.customer_short_name;
      if (values.customer_full_name)
        updates["customer_full_name"] = values.customer_full_name;
      if (values.product_code) updates["product_code"] = values.product_code;
      if (values.product_model) updates["product_model"] = values.product_model;
      if (values.quantity) updates["quantity"] = values.quantity;
      if (values.unit_price !== undefined && values.unit_price !== null)
        updates["unit_price"] = values.unit_price;
      if (values.outbound_date)
        updates["outbound_date"] = values.outbound_date.format("YYYY-MM-DD");
      if (values.invoice_date)
        updates["invoice_date"] = values.invoice_date.format("YYYY-MM-DD");
      if (values.invoice_number)
        updates["invoice_number"] = values.invoice_number;
      if (values.receipt_number)
        updates["receipt_number"] = values.receipt_number;
      if (values.order_number) updates["order_number"] = values.order_number;
      if (values.remark) updates["remark"] = values.remark;

      const payload = {
        ids: selectedRowKeys.map((key) => Number(key)),
        updates,
      };

      const result = await post<{ updated: number; notFound: number[] }>(
        "/outbound/batch",
        payload
      );

      message.success(
        `Batch update completed! ${result.updated} records updated.`
      );
      if (result.notFound && result.notFound.length > 0) {
        message.warning(`${result.notFound.length} records not found.`);
      }

      setBatchModalVisible(false);
      setSelectedRowKeys([]);
      fetchOutboundRecords({ page: pagination.current });
    } catch (error) {
      console.error("Batch save failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Batch update failed";
      message.error(errorMessage);
    }
  };

  const handleBatchCustomerCodeChange = (value: string): void => {
    const customer = partners.find((partner) => partner.code === value);
    if (customer) {
      batchForm.setFieldsValue({
        customer_short_name: customer.short_name,
        customer_full_name: customer.full_name ?? null,
      });
    }
    handleBatchPartnerOrProductChange();
  };

  const handleBatchCustomerShortNameChange = (value: string): void => {
    const customer = partners.find((partner) => partner.short_name === value);
    if (customer) {
      batchForm.setFieldsValue({
        customer_code: customer.code ?? null,
        customer_full_name: customer.full_name ?? null,
      });
    }
    handleBatchPartnerOrProductChange();
  };

  const handleBatchProductCodeChange = (value: string): void => {
    const product = products.find((item) => item.code === value);
    if (product) {
      batchForm.setFieldsValue({
        product_model: product.product_model,
        product_category: product.category ?? null,
      });
    }
    handleBatchPartnerOrProductChange();
  };

  const handleBatchProductModelChange = (value: string): void => {
    const product = products.find((item) => item.product_model === value);
    if (product) {
      batchForm.setFieldsValue({
        product_code: product.code ?? null,
        product_category: product.category ?? null,
      });
    }
    handleBatchPartnerOrProductChange();
  };

  const handleBatchPriceOrQuantityChange = (): void => {
    const quantityValue = Number(batchForm.getFieldValue("quantity") ?? 0);
    const unitPriceValue = Number(batchForm.getFieldValue("unit_price") ?? 0);
    if (quantityValue && unitPriceValue) {
      batchForm.setFieldsValue({ total_price: quantityValue * unitPriceValue });
    }
  };

  const handleBatchPartnerOrProductChange = async (): Promise<void> => {
    if (batchManualPrice) {
      return;
    }

    const customerShortNameValue = batchForm.getFieldValue(
      "customer_short_name"
    ) as string | undefined;
    const productModelValue = batchForm.getFieldValue("product_model") as
      | string
      | undefined;
    const outboundDateValue = batchForm.getFieldValue("outbound_date") as
      | Dayjs
      | undefined;

    if (customerShortNameValue && productModelValue && outboundDateValue) {
      try {
        const data = await get<{ unit_price: number }>(
          `/product-prices/auto?partner_short_name=${encodeURIComponent(
            customerShortNameValue
          )}&product_model=${encodeURIComponent(
            productModelValue
          )}&date=${outboundDateValue.format("YYYY-MM-DD")}`
        );
        batchForm.setFieldsValue({ unit_price: data.unit_price });
        handleBatchPriceOrQuantityChange();
      } catch (error) {
        console.error("获取价格失败:", error);
        batchForm.setFieldsValue({ unit_price: 0 });
      }
    }
  };

  const handleFilter = (): void => {
    setPagination((prev: PaginationState) => ({
      ...prev,
      current: 1,
    }));
    fetchOutboundRecords({
      page: 1,
      customer_short_name: filters.customer_short_name,
      product_model: filters.product_model,
      start_date: filters.dateRange[0],
      end_date: filters.dateRange[1],
    });
  };

  const handleTableChange: TableProps<OutboundRecord>["onChange"] = (
    paginationConfig,
    _filtersTable,
    sorterTable
  ) => {
    const sorterResult = Array.isArray(sorterTable)
      ? sorterTable[0]
      : (sorterTable as SorterResult<OutboundRecord> | undefined);
    const field =
      typeof sorterResult?.field === "string" ? sorterResult.field : undefined;
    const order =
      sorterResult?.order === "ascend"
        ? "asc"
        : sorterResult?.order === "descend"
        ? "desc"
        : undefined;

    setSorter({ field, order });
    setPagination((prev: PaginationState) => ({
      ...prev,
      current: paginationConfig.current ?? prev.current,
    }));

    fetchOutboundRecords({
      page: paginationConfig.current ?? 1,
      customer_short_name: filters.customer_short_name,
      product_model: filters.product_model,
      start_date: filters.dateRange[0],
      end_date: filters.dateRange[1],
      sort_field: field,
      sort_order: order,
    });
  };

  return (
    <div>
      <Card>
        <Row
          justify="space-between"
          align="middle"
          style={{ marginBottom: 16 }}
        >
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              {t("outbound.title")}
            </Title>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              {t("outbound.addOutboundRecord")}
            </Button>
          </Col>
        </Row>

        <Row
          justify="space-between"
          align="middle"
          style={{ marginBottom: 16 }}
        >
          <Col flex="auto">
            <OutboundFilter
              filters={filters}
              setFilters={setFilters}
              partners={partners}
              products={products}
              onFilter={handleFilter}
            />
          </Col>
          <Col>
            <Button
              type="default"
              icon={<EditOutlined />}
              onClick={handleBatchEdit}
              disabled={selectedRowKeys.length === 0}
              style={{ marginLeft: 8 }}
            >
              {`${t("outbound.batchEdit")}${
                selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ""
              }`}
            </Button>
          </Col>
        </Row>

        <Divider />

        <OutboundTable
          outboundRecords={outboundRecords}
          loading={loading}
          partners={partners}
          products={products}
          selectedRowKeys={selectedRowKeys}
          setSelectedRowKeys={setSelectedRowKeys}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTableChange={handleTableChange}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showQuickJumper: true,
            showSizeChanger: false,
          }}
        />
      </Card>

      <OutboundModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        editingRecord={editingRecord}
        form={form}
        partners={partners}
        products={products}
        manualPrice={manualPrice}
        setManualPrice={setManualPrice}
        onSave={handleSave}
        onCustomerCodeChange={handleCustomerCodeChange}
        onCustomerShortNameChange={handleCustomerShortNameChange}
        onProductCodeChange={handleProductCodeChange}
        onProductModelChange={handleProductModelChange}
        onPartnerOrProductChange={handlePartnerOrProductChange}
        onPriceOrQuantityChange={handlePriceOrQuantityChange}
      />

      <OutboundBatchModal
        modalVisible={batchModalVisible}
        setModalVisible={setBatchModalVisible}
        selectedCount={selectedRowKeys.length}
        form={batchForm}
        partners={partners}
        products={products}
        manualPrice={batchManualPrice}
        setManualPrice={setBatchManualPrice}
        onSave={handleBatchSave}
        onCustomerCodeChange={handleBatchCustomerCodeChange}
        onCustomerShortNameChange={handleBatchCustomerShortNameChange}
        onProductCodeChange={handleBatchProductCodeChange}
        onProductModelChange={handleBatchProductModelChange}
        onPartnerOrProductChange={handleBatchPartnerOrProductChange}
        onPriceOrQuantityChange={handleBatchPriceOrQuantityChange}
      />
    </div>
  );
};

export default Outbound;
