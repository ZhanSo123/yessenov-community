-- CreateIndex
CREATE INDEX "Community_type_isPrivate_idx" ON "Community"("type", "isPrivate");

-- CreateIndex
CREATE INDEX "Community_type_facultyCode_courseYear_idx" ON "Community"("type", "facultyCode", "courseYear");
